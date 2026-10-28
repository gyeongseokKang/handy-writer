export type GitChangeKind = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";

export interface GitFileChange {
  /** 작업 폴더 기준 상대 경로 (POSIX 구분자) */
  path: string;
  kind: GitChangeKind;
}

export interface GitStatus {
  installed: boolean;
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  /** 병합이 끝나지 않은 상태 */
  merging: boolean;
  changes: GitFileChange[];
  lastCommit: { subject: string; time: number } | null;
}

export interface GitSettings {
  /** 0이면 자동 커밋을 하지 않는다 */
  autoCommitMinutes: number;
  autoPush: boolean;
  pullOnStart: boolean;
  /** `{date}`는 `2026-10-23 14:05` 형태로 바뀐다 */
  commitMessage: string;
}

export const DEFAULT_GIT_SETTINGS: GitSettings = {
  autoCommitMinutes: 0,
  autoPush: false,
  pullOnStart: false,
  commitMessage: "handy-writer: {date}",
};

export type GitOutcome =
  | "committed"
  | "nothing-to-commit"
  | "up-to-date"
  | "fast-forward"
  | "merged"
  | "conflict"
  | "pushed"
  | "no-upstream"
  | "synced"
  | "force-pulled"
  | "force-pushed";

export interface GitOpResult {
  outcome: GitOutcome;
  /** 사용자에게 보여줄 한 줄 요약 */
  message: string;
  conflictFiles?: string[];
  /** 강제 가져오기·푸시로 덮어쓰기 전 상태를 남긴 브랜치 */
  backupBranch?: string;
}

export type GitEvent =
  | { kind: "status"; status: GitStatus }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };

export const EMPTY_GIT_STATUS: GitStatus = {
  installed: true,
  isRepo: false,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  merging: false,
  changes: [],
  lastCommit: null,
};

/** 글 한 편의 지난 버전 하나 (커밋 하나) */
export interface NoteVersion {
  hash: string;
  /** 밀리초 */
  time: number;
  subject: string;
  author: string;
  /** 그 커밋에서 이 글이 있던 저장소 루트 기준 경로 (이름을 바꾼 적이 있으면 지금과 다르다) */
  blobPath: string;
}

export interface NoteHistory {
  /** git 저장소가 아니거나 git이 없으면 false */
  available: boolean;
  /** 최근 것부터 */
  versions: NoteVersion[];
}
