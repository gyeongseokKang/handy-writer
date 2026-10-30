import type { AiEvent, AiRequest, AiStatus } from "./ai";
import type { AttachmentMeta } from "./attachments";
import type { ProjectSource, YoutubeSource } from "./draft-sources";
import type { OnlineSpellResult } from "./online-spell";
import type { UpdateState } from "./update";
import type { LogEntry, LogInput } from "./log";
import type { Template } from "./templates";
import type { SearchResult } from "./search";
import type { ExportRequest, ExportResult } from "./export";
import type { GitEvent, GitOpResult, GitSettings, GitStatus, NoteHistory } from "./git";

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
export interface AttachmentImportResult {
  imported: AttachmentMeta[];
  /** 지원하지 않는 형식이라 건너뛴 파일 이름 */
  skipped: string[];
}

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
    /** 빈 폴더까지 포함한 폴더 목록 (상대 경로) */
    folders: () => Promise<string[]>;
    /** 새 폴더를 만들고 상대 경로를 돌려준다. */
    createFolder: (parent: string, name?: string) => Promise<string>;
    renameFolder: (path: string, newName: string) => Promise<string>;
    /** 폴더를 안의 글과 함께 휴지통으로 옮긴다. */
    removeFolder: (path: string) => Promise<void>;
    move: (path: string, folder: string) => Promise<NoteMeta>;
    duplicate: (path: string) => Promise<NoteMeta>;
    /** Finder(탐색기)에서 글이나 폴더를 보여준다. */
    reveal: (path: string) => Promise<void>;
  };
  export: {
    /** 저장 위치를 물어보고 글을 마크다운, HTML, PDF 파일로 내보낸다. 취소하면 path가 null */
    note: (request: ExportRequest) => Promise<ExportResult>;
    /** Finder(탐색기)에서 내보낸 파일을 보여준다. */
    reveal: (path: string) => Promise<void>;
    /** 글을 서식 있는 HTML과 일반 글로 클립보드에 넣는다. 작업 폴더 이미지는 HTML 안에 넣는다. */
    copy: (html: string, text: string) => Promise<void>;
  };
  index: {
    get: () => Promise<NoteIndexEntry[]>;
  };
  attachments: {
    list: () => Promise<AttachmentMeta[]>;
    /** 파일 선택 창을 열고, 고른 파일을 작업 폴더의 attachments/ 로 복사한다. 취소하면 빈 결과 */
    pick: () => Promise<AttachmentImportResult>;
    /** 붙여넣거나 끌어다 놓은 파일의 내용을 attachments/ 에 저장한다. */
    save: (name: string, data: Uint8Array) => Promise<AttachmentMeta>;
    reveal: (path: string) => Promise<void>;
  };
  search: {
    query: (query: string) => Promise<SearchResult[]>;
  };
  templates: {
    list: () => Promise<Template[]>;
    /** 저장하고, 파일 이름(id)이 정해진 템플릿을 돌려준다. 새 템플릿이면 id를 비워서 보낸다. */
    save: (template: Template) => Promise<Template>;
    /** 사용자 파일을 지운다. 내장 템플릿을 고친 것이었다면 기본값으로 돌아간다. */
    remove: (id: string) => Promise<void>;
  };
  spell: {
    /** 다음·네이버 맞춤법 검사기로 문단을 검사한다. 오프라인이면 status가 offline이다. */
    check: (text: string) => Promise<OnlineSpellResult>;
  };
  update: {
    getState: () => Promise<UpdateState>;
    /** 새 버전이 있는지 확인한다(있으면 알아서 내려받는다). */
    check: () => Promise<UpdateState>;
    /** 내려받은 새 버전으로 앱을 다시 시작한다. */
    install: () => Promise<void>;
    onState: (listener: (state: UpdateState) => void) => () => void;
  };
  rules: {
    get: () => Promise<string>;
    set: (content: string) => Promise<void>;
  };
  /** 작업 폴더의 내 표기 사전 (.handy-writer/style.md) */
  styleDictionary: {
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
    /** 내 변경을 백업 브랜치에 남기고 원격과 똑같이 맞춘다 */
    forcePull: () => Promise<GitOpResult>;
    /** 원격만의 커밋을 백업 브랜치에 남기고 원격을 내 커밋으로 덮어쓴다 */
    forcePush: () => Promise<GitOpResult>;
    sync: () => Promise<GitOpResult>;
    getSettings: () => Promise<GitSettings>;
    setSettings: (settings: GitSettings) => Promise<GitSettings>;
    onEvent: (listener: (event: GitEvent) => void) => () => void;
    /** 글 한 편의 커밋 기록 (최근 것부터) */
    history: (path: string) => Promise<NoteHistory>;
    /** 그 커밋에서의 글 내용 (frontmatter 포함) */
    readVersion: (hash: string, blobPath: string) => Promise<string>;
  };
  ai: {
    status: () => Promise<AiStatus>;
    /** 실행을 시작하고 runId를 돌려준다. 결과는 onEvent로 흘러온다. */
    run: (request: AiRequest) => Promise<string>;
    cancel: (runId: string) => Promise<void>;
    onEvent: (listener: (event: AiEvent) => void) => () => void;
  };
  /** 초안 만들기에 붙이는 자료 */
  sources: {
    /** 유튜브 주소로 제목, 설명, 자막을 받는다. */
    youtube: (url: string) => Promise<YoutubeSource>;
    /** 폴더 선택 창으로 프로젝트 폴더를 고른다. 취소하면 null */
    pickProject: () => Promise<ProjectSource | null>;
  };
  log: {
    /** 앱을 켠 뒤 모인 오류·경고 (오래된 것부터) */
    list: () => Promise<LogEntry[]>;
    clear: () => Promise<void>;
    /** 화면에서 생긴 오류를 남긴다. */
    add: (input: LogInput) => Promise<void>;
    /** Finder에서 로그 파일을 보여준다. */
    reveal: () => Promise<void>;
    onEntry: (listener: (entry: LogEntry) => void) => () => void;
  };
  onNotesChanged: (listener: (event: NotesChangedEvent) => void) => () => void;
  /** Ctrl/Cmd+W를 눌렀을 때 (창 대신 지금 탭을 닫는다) */
  onCloseTab: (listener: () => void) => () => void;
  app: {
    /** 창을 닫기 전에 불린다. 저장할 것을 모두 쓴 뒤 closeReady로 답해야 창이 닫힌다. */
    onBeforeClose: (listener: () => void) => () => void;
    /** 저장하지 못한 글의 경로를 알린다. 비어 있으면 바로 닫고, 있으면 닫을지 묻는다. */
    closeReady: (unsavedPaths: string[]) => void;
  };
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
  notesFolders: "notes:folders",
  notesCreateFolder: "notes:create-folder",
  notesRenameFolder: "notes:rename-folder",
  notesRemoveFolder: "notes:remove-folder",
  notesMove: "notes:move",
  notesDuplicate: "notes:duplicate",
  notesReveal: "notes:reveal",
  exportNote: "export:note",
  exportReveal: "export:reveal",
  exportCopy: "export:copy",
  indexGet: "index:get",
  searchQuery: "search:query",
  spellCheck: "spell:check",
  updateGet: "update:get",
  updateCheck: "update:check",
  updateInstall: "update:install",
  updateState: "update:state",
  logList: "log:list",
  logClear: "log:clear",
  logAdd: "log:add",
  logReveal: "log:reveal",
  logEntry: "log:entry",
  templatesList: "templates:list",
  templatesSave: "templates:save",
  templatesRemove: "templates:remove",
  attachmentsList: "attachments:list",
  attachmentsPick: "attachments:pick",
  attachmentsSave: "attachments:save",
  attachmentsReveal: "attachments:reveal",
  rulesGet: "rules:get",
  rulesSet: "rules:set",
  styleDictionaryGet: "style-dictionary:get",
  styleDictionarySet: "style-dictionary:set",
  gitStatus: "git:status",
  gitInit: "git:init",
  gitSetRemote: "git:set-remote",
  gitCommit: "git:commit",
  gitPull: "git:pull",
  gitPush: "git:push",
  gitForcePull: "git:force-pull",
  gitForcePush: "git:force-push",
  gitSync: "git:sync",
  gitGetSettings: "git:get-settings",
  gitSetSettings: "git:set-settings",
  gitEvent: "git:event",
  gitHistory: "git:history",
  gitReadVersion: "git:read-version",
  aiStatus: "ai:status",
  aiRun: "ai:run",
  aiCancel: "ai:cancel",
  aiEvent: "ai:event",
  sourcesYoutube: "sources:youtube",
  sourcesPickProject: "sources:pick-project",
  notesChanged: "notes:changed",
  tabsCloseCurrent: "tabs:close-current",
  appBeforeClose: "app:before-close",
  appCloseReady: "app:close-ready",
} as const;
