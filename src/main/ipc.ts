import { app, BrowserWindow, dialog, ipcMain, net, shell } from "electron";
import type { FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { ExportRequest } from "../shared/export";
import type { Template } from "../shared/templates";
import { IPC, type WorkspaceInfo } from "../shared/types";
import { registerAiIpc } from "./ai/ipc-ai";
import { scanProject } from "./project-context";
import { fetchYoutube } from "./youtube";
import { ATTACHMENT_EXTENSIONS } from "../shared/attachments";
import type { ProjectSource } from "../shared/draft-sources";
import { importFiles, listAttachments, saveAttachment } from "./attachments";
import { copyNote, exportNote } from "./export";
import { createGitIpc } from "./git/ipc-git";
import { NoteIndexer } from "./notes-index";
import { NoteSearcher } from "./notes-search";
import { listTemplates, removeTemplate, saveTemplate } from "./templates-fs";
import { hanspellTransport } from "./spell/hanspell-transport";
import { createOnlineSpeller } from "./spell/online-speller";
import { createFolder, createNote, duplicateNote, listFolders, listNotes, moveNote, readNote, renameFolder, resolveInside, writeNote } from "./notes-fs";
import { loadWorkspaceRoot, saveWorkspaceRoot } from "./workspace-config";
import { watchNotes } from "./watcher";

let root: string | null = null;

export const getWorkspaceRoot = () => root;
let watcher: FSWatcher | null = null;
const indexer = new NoteIndexer();
const searcher = new NoteSearcher();
const onlineSpeller = createOnlineSpeller({ transport: hanspellTransport, isOnline: () => net.isOnline() });
const gitIpc = createGitIpc(requireRoot);

function requireRoot() {
  if (!root) throw new Error("작업 폴더가 선택되지 않았어요.");
  return root;
}

function startWatching() {
  watcher?.close();
  watcher = null;
  if (!root) return;
  watcher = watchNotes(root, (event) => {
    indexer.invalidate(event.paths);
    searcher.invalidate(event.paths);
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.notesChanged, event);
  });
}

async function setRoot(next: string): Promise<WorkspaceInfo> {
  await mkdir(next, { recursive: true });
  root = next;
  indexer.setRoot(next);
  searcher.setRoot(next);
  gitIpc.onRootChanged(next);
  await saveWorkspaceRoot(next);
  startWatching();
  return { root };
}

export async function registerIpc() {
  root = await loadWorkspaceRoot();
  indexer.setRoot(root);
  searcher.setRoot(root);
  gitIpc.onRootChanged(root);
  startWatching();

  ipcMain.handle(IPC.workspaceGet, (): WorkspaceInfo => ({ root }));

  ipcMain.handle(IPC.workspaceChoose, async (event): Promise<WorkspaceInfo> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "작업 폴더 선택",
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return { root };
    return setRoot(picked);
  });

  ipcMain.handle(IPC.workspaceUseDefault, () => setRoot(join(app.getPath("documents"), "HandyWriter")));

  ipcMain.handle(IPC.notesList, () => listNotes(requireRoot()));
  ipcMain.handle(IPC.notesRead, (_e, path: string) => readNote(requireRoot(), path));
  ipcMain.handle(IPC.notesWrite, (_e, path: string, content: string) => writeNote(requireRoot(), path, content));
  ipcMain.handle(IPC.notesCreate, (_e, folder: string, title?: string) => createNote(requireRoot(), folder, title));
  ipcMain.handle(IPC.notesRename, (_e, path: string, newName: string) =>
    indexer.renameWithLinks(requireRoot(), path, newName),
  );
  ipcMain.handle(IPC.exportNote, (event, request: ExportRequest) =>
    exportNote(requireRoot(), BrowserWindow.fromWebContents(event.sender), {
      name: String(request?.name ?? ""),
      format: request?.format,
      content: String(request?.content ?? ""),
    }),
  );
  ipcMain.handle(IPC.exportCopy, (_e, html: string, text: string) => copyNote(requireRoot(), String(html ?? ""), String(text ?? "")));
  ipcMain.handle(IPC.exportReveal, (_e, path: string) => shell.showItemInFolder(String(path)));
  ipcMain.handle(IPC.indexGet, () => indexer.build(requireRoot()));
  ipcMain.handle(IPC.attachmentsList, () => listAttachments(requireRoot()));
  ipcMain.handle(IPC.attachmentsPick, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "첨부할 파일 선택",
      properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
      filters: [{ name: "이미지, 영상, 오디오, PDF", extensions: ATTACHMENT_EXTENSIONS }],
    };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (picked.canceled) return { imported: [], skipped: [] };
    return importFiles(requireRoot(), picked.filePaths);
  });
  ipcMain.handle(IPC.attachmentsSave, (_e, name: string, data: Uint8Array) => saveAttachment(requireRoot(), String(name), data));
  ipcMain.handle(IPC.attachmentsReveal, (_e, path: string) => {
    shell.showItemInFolder(resolveInside(requireRoot(), String(path)));
  });
  ipcMain.handle(IPC.templatesList, () => listTemplates(requireRoot()));
  ipcMain.handle(IPC.templatesSave, (_e, template: Template) => saveTemplate(requireRoot(), template));
  ipcMain.handle(IPC.templatesRemove, (_e, id: string) => removeTemplate(requireRoot(), String(id)));
  ipcMain.handle(IPC.spellCheck, (_e, text: string) => onlineSpeller.check(String(text ?? "")));
  ipcMain.handle(IPC.searchQuery, (_e, query: string) => searcher.search(requireRoot(), String(query ?? "")));

  // 폴더 선택 창으로 고른 프로젝트만 AI가 읽게 한다.
  const pickedProjects = new Set<string>();
  ipcMain.handle(IPC.sourcesYoutube, (_e, url: string) => fetchYoutube(String(url ?? "")));
  ipcMain.handle(IPC.sourcesPickProject, async (event): Promise<ProjectSource | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "초안에 참고할 프로젝트 폴더 선택", properties: ["openDirectory"] as Array<"openDirectory"> };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return null;
    const scan = await scanProject(path);
    pickedProjects.add(path);
    return { kind: "project", path, name: scan.name, fileCount: scan.fileCount };
  });

  registerAiIpc(requireRoot, (path) => pickedProjects.has(path));
  gitIpc.register();
  ipcMain.handle(IPC.notesRemove, (_e, path: string) => shell.trashItem(resolveInside(requireRoot(), path)));
  ipcMain.handle(IPC.notesFolders, () => listFolders(requireRoot()));
  ipcMain.handle(IPC.notesCreateFolder, (_e, parent: string, name?: string) => createFolder(requireRoot(), String(parent ?? ""), name === undefined ? undefined : String(name)));
  ipcMain.handle(IPC.notesRenameFolder, (_e, path: string, newName: string) => renameFolder(requireRoot(), String(path), String(newName)));
  ipcMain.handle(IPC.notesRemoveFolder, (_e, path: string) => {
    if (!path) throw new Error("작업 폴더 자체는 지울 수 없어요.");
    return shell.trashItem(resolveInside(requireRoot(), String(path)));
  });
  ipcMain.handle(IPC.notesMove, (_e, path: string, folder: string) => moveNote(requireRoot(), String(path), String(folder ?? "")));
  ipcMain.handle(IPC.notesDuplicate, (_e, path: string) => duplicateNote(requireRoot(), String(path)));
  ipcMain.handle(IPC.notesReveal, (_e, path: string) => {
    shell.showItemInFolder(resolveInside(requireRoot(), String(path)));
  });
}
