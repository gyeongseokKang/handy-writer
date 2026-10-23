import { contextBridge, ipcRenderer } from "electron";

import { IPC, type HandyApi, type NotesChangedEvent } from "../shared/types";

const api: HandyApi = {
  platform: process.platform,
  workspace: {
    get: () => ipcRenderer.invoke(IPC.workspaceGet),
    choose: () => ipcRenderer.invoke(IPC.workspaceChoose),
    useDefault: () => ipcRenderer.invoke(IPC.workspaceUseDefault),
  },
  notes: {
    list: () => ipcRenderer.invoke(IPC.notesList),
    read: (path) => ipcRenderer.invoke(IPC.notesRead, path),
    write: (path, content) => ipcRenderer.invoke(IPC.notesWrite, path, content),
    create: (folder, title) => ipcRenderer.invoke(IPC.notesCreate, folder, title),
    rename: (path, newName) => ipcRenderer.invoke(IPC.notesRename, path, newName),
    remove: (path) => ipcRenderer.invoke(IPC.notesRemove, path),
  },
  onNotesChanged: (listener) => {
    const handler = (_e: unknown, event: NotesChangedEvent) => listener(event);
    ipcRenderer.on(IPC.notesChanged, handler);
    return () => ipcRenderer.removeListener(IPC.notesChanged, handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
