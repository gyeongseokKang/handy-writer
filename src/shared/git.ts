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
  | "synced";

export interface GitOpResult {
  outcome: GitOutcome;
  /** 사용자에게 보여줄 한 줄 요약 */
  message: string;
  conflictFiles?: string[];
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
