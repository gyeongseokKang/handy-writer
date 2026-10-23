import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { IPC, type WorkspaceInfo } from "../shared/types";
import { createNote, listNotes, readNote, renameNote, resolveInside, writeNote } from "./notes-fs";
import { loadWorkspaceRoot, saveWorkspaceRoot } from "./workspace-config";
import { watchNotes } from "./watcher";

let root: string | null = null;
let watcher: FSWatcher | null = null;

function requireRoot() {
  if (!root) throw new Error("작업 폴더가 선택되지 않았어요.");
  return root;
}

function startWatching() {
  watcher?.close();
  watcher = null;
  if (!root) return;
  watcher = watchNotes(root, (event) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.notesChanged, event);
  });
}

async function setRoot(next: string): Promise<WorkspaceInfo> {
  await mkdir(next, { recursive: true });
  root = next;
  await saveWorkspaceRoot(next);
  startWatching();
  return { root };
}

export async function registerIpc() {
  root = await loadWorkspaceRoot();
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
  ipcMain.handle(IPC.notesRename, (_e, path: string, newName: string) => renameNote(requireRoot(), path, newName));
  ipcMain.handle(IPC.notesRemove, (_e, path: string) => shell.trashItem(resolveInside(requireRoot(), path)));
}
