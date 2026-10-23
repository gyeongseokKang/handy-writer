import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { IPC, type WorkspaceInfo } from "../shared/types";
import { registerAiIpc } from "./ai/ipc-ai";
import { ATTACHMENT_EXTENSIONS } from "../shared/attachments";
import { importFiles, listAttachments, saveAttachment } from "./attachments";
import { createGitIpc } from "./git/ipc-git";
import { NoteIndexer } from "./notes-index";
import { NoteSearcher } from "./notes-search";
import { createNote, listNotes, readNote, resolveInside, writeNote } from "./notes-fs";
import { loadWorkspaceRoot, saveWorkspaceRoot } from "./workspace-config";
import { watchNotes } from "./watcher";

let root: string | null = null;

export const getWorkspaceRoot = () => root;
let watcher: FSWatcher | null = null;
const indexer = new NoteIndexer();
const searcher = new NoteSearcher();
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
  ipcMain.handle(IPC.searchQuery, (_e, query: string) => searcher.search(requireRoot(), String(query ?? "")));

  registerAiIpc(requireRoot);
  gitIpc.register();
  ipcMain.handle(IPC.notesRemove, (_e, path: string) => shell.trashItem(resolveInside(requireRoot(), path)));
}
