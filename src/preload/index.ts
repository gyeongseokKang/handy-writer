import { contextBridge, ipcRenderer } from "electron";

import type { AiEvent } from "../shared/ai";
import type { GitEvent } from "../shared/git";
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
  index: {
    get: () => ipcRenderer.invoke(IPC.indexGet),
  },
  search: {
    query: (query) => ipcRenderer.invoke(IPC.searchQuery, query),
  },
  rules: {
    get: () => ipcRenderer.invoke(IPC.rulesGet),
    set: (content) => ipcRenderer.invoke(IPC.rulesSet, content),
  },
  git: {
    status: () => ipcRenderer.invoke(IPC.gitStatus),
    init: () => ipcRenderer.invoke(IPC.gitInit),
    setRemote: (url) => ipcRenderer.invoke(IPC.gitSetRemote, url),
    commit: (message) => ipcRenderer.invoke(IPC.gitCommit, message),
    pull: () => ipcRenderer.invoke(IPC.gitPull),
    push: () => ipcRenderer.invoke(IPC.gitPush),
    sync: () => ipcRenderer.invoke(IPC.gitSync),
    getSettings: () => ipcRenderer.invoke(IPC.gitGetSettings),
    setSettings: (settings) => ipcRenderer.invoke(IPC.gitSetSettings, settings),
    onEvent: (listener) => {
      const handler = (_e: unknown, event: GitEvent) => listener(event);
      ipcRenderer.on(IPC.gitEvent, handler);
      return () => ipcRenderer.removeListener(IPC.gitEvent, handler);
    },
  },
  ai: {
    status: () => ipcRenderer.invoke(IPC.aiStatus),
    run: (request) => ipcRenderer.invoke(IPC.aiRun, request),
    cancel: (runId) => ipcRenderer.invoke(IPC.aiCancel, runId),
    onEvent: (listener) => {
      const handler = (_e: unknown, event: AiEvent) => listener(event);
      ipcRenderer.on(IPC.aiEvent, handler);
      return () => ipcRenderer.removeListener(IPC.aiEvent, handler);
    },
  },
  onNotesChanged: (listener) => {
    const handler = (_e: unknown, event: NotesChangedEvent) => listener(event);
    ipcRenderer.on(IPC.notesChanged, handler);
    return () => ipcRenderer.removeListener(IPC.notesChanged, handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
