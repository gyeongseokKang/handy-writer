import type { AiEvent, AiRequest, AiStatus } from "./ai";
import type { GitEvent, GitOpResult, GitSettings, GitStatus } from "./git";

export interface NoteMeta {
  /** 작업 폴더 기준 상대 경로 (POSIX 구분자, .md 포함) */
  path: string;
  /** 확장자를 뺀 파일 이름 */
  name: string;
  /** 상위 폴더의 상대 경로 (루트면 빈 문자열) */
  folder: string;
  mtime: number;
}

/** 글 하나의 링크와 태그 정보. 백링크, 태그 목록, 그래프를 만드는 재료다. */
export interface NoteIndexEntry {
  path: string;
  name: string;
  tags: string[];
  /** 이 글이 연결하는 대상 이름들 (아직 없는 글일 수도 있다) */
  links: string[];
}

export interface RenameResult {
  meta: NoteMeta;
  /** 이름이 바뀐 글을 가리키던 `[[링크]]`를 고친 다른 글의 수 */
  updatedNotes: number;
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
    rename: (path: string, newName: string) => Promise<RenameResult>;
    remove: (path: string) => Promise<void>;
  };
  index: {
    get: () => Promise<NoteIndexEntry[]>;
  };
  rules: {
    get: () => Promise<string>;
    set: (content: string) => Promise<void>;
  };
  git: {
    status: () => Promise<GitStatus>;
    init: () => Promise<GitStatus>;
    setRemote: (url: string) => Promise<GitStatus>;
    commit: (message: string) => Promise<GitOpResult>;
    pull: () => Promise<GitOpResult>;
    push: () => Promise<GitOpResult>;
    sync: () => Promise<GitOpResult>;
    getSettings: () => Promise<GitSettings>;
    setSettings: (settings: GitSettings) => Promise<GitSettings>;
    onEvent: (listener: (event: GitEvent) => void) => () => void;
  };
  ai: {
    status: () => Promise<AiStatus>;
    /** 실행을 시작하고 runId를 돌려준다. 결과는 onEvent로 흘러온다. */
    run: (request: AiRequest) => Promise<string>;
    cancel: (runId: string) => Promise<void>;
    onEvent: (listener: (event: AiEvent) => void) => () => void;
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
  indexGet: "index:get",
  rulesGet: "rules:get",
  rulesSet: "rules:set",
  gitStatus: "git:status",
  gitInit: "git:init",
  gitSetRemote: "git:set-remote",
  gitCommit: "git:commit",
  gitPull: "git:pull",
  gitPush: "git:push",
  gitSync: "git:sync",
  gitGetSettings: "git:get-settings",
  gitSetSettings: "git:set-settings",
  gitEvent: "git:event",
  aiStatus: "ai:status",
  aiRun: "ai:run",
  aiCancel: "ai:cancel",
  aiEvent: "ai:event",
  notesChanged: "notes:changed",
} as const;
