import { contextBridge, ipcRenderer } from "electron";

import type { AiEvent } from "../shared/ai";
import type { GitEvent } from "../shared/git";
import type { LogEntry } from "../shared/log";
import type { UpdateState } from "../shared/update";
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
    folders: () => ipcRenderer.invoke(IPC.notesFolders),
    createFolder: (parent, name) => ipcRenderer.invoke(IPC.notesCreateFolder, parent, name),
    renameFolder: (path, newName) => ipcRenderer.invoke(IPC.notesRenameFolder, path, newName),
    removeFolder: (path) => ipcRenderer.invoke(IPC.notesRemoveFolder, path),
    move: (path, folder) => ipcRenderer.invoke(IPC.notesMove, path, folder),
    duplicate: (path) => ipcRenderer.invoke(IPC.notesDuplicate, path),
    reveal: (path) => ipcRenderer.invoke(IPC.notesReveal, path),
  },
  export: {
    note: (request) => ipcRenderer.invoke(IPC.exportNote, request),
    reveal: (path) => ipcRenderer.invoke(IPC.exportReveal, path),
    copy: (html, text) => ipcRenderer.invoke(IPC.exportCopy, html, text),
  },
  index: {
    get: () => ipcRenderer.invoke(IPC.indexGet),
  },
  attachments: {
    list: () => ipcRenderer.invoke(IPC.attachmentsList),
    pick: () => ipcRenderer.invoke(IPC.attachmentsPick),
    save: (name, data) => ipcRenderer.invoke(IPC.attachmentsSave, name, data),
    reveal: (path) => ipcRenderer.invoke(IPC.attachmentsReveal, path),
  },
  search: {
    query: (query) => ipcRenderer.invoke(IPC.searchQuery, query),
  },
  templates: {
    list: () => ipcRenderer.invoke(IPC.templatesList),
    save: (template) => ipcRenderer.invoke(IPC.templatesSave, template),
    remove: (id) => ipcRenderer.invoke(IPC.templatesRemove, id),
  },
  spell: {
    check: (text) => ipcRenderer.invoke(IPC.spellCheck, text),
  },
  update: {
    getState: () => ipcRenderer.invoke(IPC.updateGet),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    onState: (listener) => {
      const handler = (_e: unknown, state: UpdateState) => listener(state);
      ipcRenderer.on(IPC.updateState, handler);
      return () => ipcRenderer.removeListener(IPC.updateState, handler);
    },
  },
  rules: {
    get: () => ipcRenderer.invoke(IPC.rulesGet),
    set: (content) => ipcRenderer.invoke(IPC.rulesSet, content),
  },
  extract: {
    fromUrl: (url) => ipcRenderer.invoke(IPC.extractFromUrl, url),
  },
  tags: {
    suggest: (path, text) => ipcRenderer.invoke(IPC.tagsSuggest, path, text),
  },
  styleDictionary: {
    get: () => ipcRenderer.invoke(IPC.styleDictionaryGet),
    set: (content) => ipcRenderer.invoke(IPC.styleDictionarySet, content),
  },
  git: {
    status: () => ipcRenderer.invoke(IPC.gitStatus),
    init: () => ipcRenderer.invoke(IPC.gitInit),
    setRemote: (url) => ipcRenderer.invoke(IPC.gitSetRemote, url),
    commit: (message) => ipcRenderer.invoke(IPC.gitCommit, message),
    pull: () => ipcRenderer.invoke(IPC.gitPull),
    push: () => ipcRenderer.invoke(IPC.gitPush),
    forcePull: () => ipcRenderer.invoke(IPC.gitForcePull),
    forcePush: () => ipcRenderer.invoke(IPC.gitForcePush),
    sync: () => ipcRenderer.invoke(IPC.gitSync),
    getSettings: () => ipcRenderer.invoke(IPC.gitGetSettings),
    setSettings: (settings) => ipcRenderer.invoke(IPC.gitSetSettings, settings),
    onEvent: (listener) => {
      const handler = (_e: unknown, event: GitEvent) => listener(event);
      ipcRenderer.on(IPC.gitEvent, handler);
      return () => ipcRenderer.removeListener(IPC.gitEvent, handler);
    },
    history: (path) => ipcRenderer.invoke(IPC.gitHistory, path),
    readVersion: (hash, blobPath) => ipcRenderer.invoke(IPC.gitReadVersion, hash, blobPath),
  },
  sources: {
    youtube: (url) => ipcRenderer.invoke(IPC.sourcesYoutube, url),
    pickProject: () => ipcRenderer.invoke(IPC.sourcesPickProject),
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
  log: {
    list: () => ipcRenderer.invoke(IPC.logList),
    clear: () => ipcRenderer.invoke(IPC.logClear),
    add: (input) => ipcRenderer.invoke(IPC.logAdd, input),
    reveal: () => ipcRenderer.invoke(IPC.logReveal),
    onEntry: (listener) => {
      const handler = (_e: unknown, entry: LogEntry) => listener(entry);
      ipcRenderer.on(IPC.logEntry, handler);
      return () => ipcRenderer.removeListener(IPC.logEntry, handler);
    },
  },
  onNotesChanged: (listener) => {
    const handler = (_e: unknown, event: NotesChangedEvent) => listener(event);
    ipcRenderer.on(IPC.notesChanged, handler);
    return () => ipcRenderer.removeListener(IPC.notesChanged, handler);
  },
  onCloseTab: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(IPC.tabsCloseCurrent, handler);
    return () => ipcRenderer.removeListener(IPC.tabsCloseCurrent, handler);
  },
  app: {
    onBeforeClose: (listener) => {
      const handler = () => listener();
      ipcRenderer.on(IPC.appBeforeClose, handler);
      return () => ipcRenderer.removeListener(IPC.appBeforeClose, handler);
    },
    closeReady: (unsavedPaths) => ipcRenderer.send(IPC.appCloseReady, unsavedPaths),
  },
};

contextBridge.exposeInMainWorld("api", api);
