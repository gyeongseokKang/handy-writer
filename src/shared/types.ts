export interface NoteMeta {
  /** 작업 폴더 기준 상대 경로 (POSIX 구분자, .md 포함) */
  path: string;
  /** 확장자를 뺀 파일 이름 */
  name: string;
  /** 상위 폴더의 상대 경로 (루트면 빈 문자열) */
  folder: string;
  mtime: number;
}

export interface WorkspaceInfo {
  root: string | null;
}

export interface NotesChangedEvent {
  /** 변경된 노트의 상대 경로들 */
  paths: string[];
}

export interface HandyApi {
  platform: string;
  workspace: {
    get: () => Promise<WorkspaceInfo>;
    choose: () => Promise<WorkspaceInfo>;
    useDefault: () => Promise<WorkspaceInfo>;
  };
  notes: {
    list: () => Promise<NoteMeta[]>;
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    create: (folder: string, title?: string) => Promise<NoteMeta>;
    rename: (path: string, newName: string) => Promise<NoteMeta>;
    remove: (path: string) => Promise<void>;
  };
  onNotesChanged: (listener: (event: NotesChangedEvent) => void) => () => void;
}

export const IPC = {
  workspaceGet: "workspace:get",
  workspaceChoose: "workspace:choose",
  workspaceUseDefault: "workspace:use-default",
  notesList: "notes:list",
  notesRead: "notes:read",
  notesWrite: "notes:write",
  notesCreate: "notes:create",
  notesRename: "notes:rename",
  notesRemove: "notes:remove",
  notesChanged: "notes:changed",
} as const;
