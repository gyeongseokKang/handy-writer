import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  EMPTY_GIT_STATUS,
  type GitOpResult,
  type GitSettings,
  type GitStatus,
  type NoteHistory,
} from "../../shared/git";
import { explainGitError, parseNoteLog, parseStatusV2, relativizeChanges, toGitStatus } from "./parse";
import { GitError, isGitMissing, runGit } from "./runner";

const NETWORK_TIMEOUT_MS = 90_000;
/** 기록 화면에 보여줄 최대 버전 수 */
export const HISTORY_LIMIT = 300;

/** `{date}`를 `2026-10-23 14:05`로 바꾼다. */
export function formatCommitMessage(template: string, now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return (template.trim() || "handy-writer: {date}").replaceAll("{date}", date);
}

/** 덮어쓰기 전 상태를 남길 브랜치 이름: `handy-writer/backup-20261028-1405` */
export function backupBranchName(kind: "local" | "remote", now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `handy-writer/backup-${kind === "remote" ? "remote-" : ""}${stamp}`;
}

function fail(error: unknown): never {
  if (error instanceof GitError) throw new Error(explainGitError(error.stderr || error.message));
  throw error;
}

/**
 * 작업 폴더의 git 저장소를 다룬다. 내용을 잃을 수 있는 동작(강제 푸시, reset, 충돌 마커 남기기)은
 * 사용자가 강제 가져오기·강제 푸시를 직접 고를 때만 하고, 그때도 덮어쓰기 전 상태를 백업 브랜치로 남긴다.
 * 같은 폴더에 대한 명령은 한 줄로 세워서 index.lock 충돌을 막는다.
 */
export class GitService {
  private queues = new Map<string, Promise<unknown>>();

  private enqueue<T>(root: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(root) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(
      root,
      next.catch(() => {}),
    );
    return next;
  }

  status(root: string): Promise<GitStatus> {
    return this.enqueue(root, () => this.readStatus(root));
  }

  private async readStatus(root: string): Promise<GitStatus> {
    let prefix: string;
    try {
      const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree", "--show-prefix"], { readOnly: true });
      const [flag, rawPrefix = ""] = inside.stdout.split("\n");
      if (flag?.trim() !== "true") return EMPTY_GIT_STATUS;
      prefix = rawPrefix.trim();
    } catch (error) {
      if (isGitMissing(error)) return { ...EMPTY_GIT_STATUS, installed: false };
      return EMPTY_GIT_STATUS;
    }

    const [statusOut, remotes, mergeHead, log] = await Promise.all([
      runGit(root, ["status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z", "--", "."], { readOnly: true }),
      runGit(root, ["remote"], { readOnly: true }),
      runGit(root, ["rev-parse", "-q", "--verify", "MERGE_HEAD"], { readOnly: true }).then(() => true, () => false),
      runGit(root, ["log", "-1", "--format=%ct%x00%s"], { readOnly: true }).then((r) => r.stdout, () => ""),
    ]);

    const [time, subject] = log.trim().split("\0");
    return toGitStatus(
      parseStatusV2(statusOut.stdout),
      {
        hasRemote: remotes.stdout.trim() !== "",
        merging: mergeHead,
        lastCommit: time && subject !== undefined ? { time: Number(time) * 1000, subject } : null,
      },
      prefix,
    );
  }

  /** 글 한 편의 커밋 기록 (최근 것부터). 이름을 바꾼 적이 있어도 따라간다. 읽기만 한다. */
  async history(root: string, notePath: string): Promise<NoteHistory> {
    try {
      const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"], { readOnly: true });
      if (inside.stdout.trim() !== "true") return { available: false, versions: [] };
    } catch {
      return { available: false, versions: [] };
    }
    const log = await runGit(
      root,
      ["log", "--follow", "--name-only", "-z", `--max-count=${HISTORY_LIMIT}`, "--format=%x1e%H%x00%ct%x00%an%x00%s", "--", notePath],
      { readOnly: true },
    ).catch((error: unknown) => {
      // 커밋이 하나도 없는 저장소
      if (error instanceof GitError && /does not have any commits|bad default revision/.test(error.stderr)) return { stdout: "" };
      fail(error);
    });
    return { available: true, versions: parseNoteLog(log.stdout) };
  }

  /** 어떤 커밋에서의 글 내용. 그 커밋에 글이 없으면 빈 문자열이다. */
  async readVersion(root: string, hash: string, blobPath: string): Promise<string> {
    if (!/^[0-9a-f]{7,64}$/.test(hash)) throw new Error("잘못된 커밋이에요.");
    if (!blobPath.endsWith(".md") || blobPath.startsWith("-")) throw new Error("마크다운 글만 읽을 수 있어요.");
    return runGit(root, ["show", `${hash}:${blobPath}`], { readOnly: true }).then((r) => r.stdout, () => "");
  }

  async init(root: string): Promise<GitStatus> {
    await this.enqueue(root, async () => {
      try {
        await runGit(root, ["init", "-b", "main"]);
      } catch {
        // 오래된 git은 -b를 모른다.
        await runGit(root, ["init"]).then(() => runGit(root, ["symbolic-ref", "HEAD", "refs/heads/main"])).catch(fail);
      }
      const ignore = join(root, ".gitignore");
      await access(ignore).catch(() => writeFile(ignore, ".DS_Store\n", "utf8"));
    });
    return this.status(root);
  }

  setRemote(root: string, url: string): Promise<GitStatus> {
    const trimmed = url.trim();
    if (!trimmed) throw new Error("원격 저장소 주소를 입력해 주세요.");
    return this.enqueue(root, async () => {
      const existing = await runGit(root, ["remote"]).then((r) => r.stdout.split("\n").includes("origin"), () => false);
      await runGit(root, ["remote", existing ? "set-url" : "add", "origin", trimmed]).catch(fail);
      return this.readStatus(root);
    });
  }

  commit(root: string, message: string): Promise<GitOpResult> {
    return this.enqueue(root, () => this.doCommit(root, message));
  }

  private async doCommit(root: string, message: string): Promise<GitOpResult> {
    const status = await this.readStatus(root);
    if (!status.isRepo) throw new Error("아직 git 저장소가 아니에요.");
    if (status.changes.some((change) => change.kind === "conflicted")) {
      throw new Error("충돌이 해결되지 않은 파일이 있어서 커밋할 수 없어요.");
    }
    await runGit(root, ["add", "-A", "--", "."]).catch(fail);
    const staged = await runGit(root, ["diff", "--cached", "--quiet"]).then(() => false, (error: unknown) => {
      if (error instanceof GitError && error.code === 1) return true;
      throw error;
    });
    if (!staged) return { outcome: "nothing-to-commit", message: "커밋할 변경이 없어요." };
    await runGit(root, ["commit", "-m", message.trim() || formatCommitMessage("")]).catch(fail);
    return { outcome: "committed", message: "변경을 커밋했어요." };
  }

  pull(root: string): Promise<GitOpResult> {
    return this.enqueue(root, () => this.doPull(root));
  }

  private async doPull(root: string): Promise<GitOpResult> {
    const before = await this.readStatus(root);
    if (!before.isRepo) throw new Error("아직 git 저장소가 아니에요.");
    if (!before.hasRemote) return { outcome: "no-upstream", message: "원격 저장소가 아직 연결되지 않았어요." };

    await runGit(root, ["fetch", "--prune"], { timeoutMs: NETWORK_TIMEOUT_MS }).catch(fail);
    const fetched = await this.readStatus(root);
    if (!fetched.upstream) return { outcome: "no-upstream", message: "원격에 이 브랜치가 아직 없어요. 푸시하면 만들어져요." };
    if (fetched.behind === 0) return { outcome: "up-to-date", message: "이미 최신이에요." };

    try {
      await runGit(root, ["merge", "--no-edit", "@{u}"], { timeoutMs: NETWORK_TIMEOUT_MS });
    } catch (error) {
      const unmerged = await runGit(root, ["diff", "--name-only", "--diff-filter=U", "-z"]).then((r) => r.stdout.split("\0").filter(Boolean), () => [] as string[]);
      if (unmerged.length === 0) fail(error);
      // 충돌 표시(<<<<<<<)가 글에 남지 않도록 병합을 되돌린다.
      await runGit(root, ["merge", "--abort"]).catch(() => {});
      const prefix = (await runGit(root, ["rev-parse", "--show-prefix"])).stdout.trim();
      const files = relativizeChanges(unmerged.map((path) => ({ path, kind: "conflicted" as const })), prefix).map((c) => c.path);
      return {
        outcome: "conflict",
        conflictFiles: files,
        message: `같은 부분을 양쪽에서 고쳐서 합치지 못했어요 (${files.length}개 파일). 글은 그대로 두었어요. 터미널에서 직접 병합해 주세요.`,
      };
    }
    return before.ahead === 0
      ? { outcome: "fast-forward", message: `원격의 새 변경 ${fetched.behind}건을 가져왔어요.` }
      : { outcome: "merged", message: "원격 변경과 내 변경을 합쳤어요." };
  }

  push(root: string): Promise<GitOpResult> {
    return this.enqueue(root, () => this.doPush(root));
  }

  private async doPush(root: string): Promise<GitOpResult> {
    const status = await this.readStatus(root);
    if (!status.isRepo) throw new Error("아직 git 저장소가 아니에요.");
    if (!status.hasRemote) throw new Error("원격 저장소가 연결되지 않았어요. 먼저 주소를 연결해 주세요.");
    if (!status.lastCommit) throw new Error("아직 커밋이 없어요. 먼저 커밋해 주세요.");
    if (status.upstream && status.ahead === 0) return { outcome: "up-to-date", message: "푸시할 커밋이 없어요." };

    const args = status.upstream ? ["push"] : ["push", "-u", "origin", "HEAD"];
    await runGit(root, args, { timeoutMs: NETWORK_TIMEOUT_MS }).catch(fail);
    return { outcome: "pushed", message: "원격 저장소에 올렸어요." };
  }

  /**
   * 강제 가져오기: 내 커밋과 저장하지 않은 변경을 버리고 원격과 똑같이 맞춘다.
   * 버리기 전에 지금 상태(저장 안 한 변경 포함)를 백업 브랜치에 커밋해 둔다.
   */
  forcePull(root: string): Promise<GitOpResult> {
    return this.enqueue(root, async () => {
      const before = await this.readStatus(root);
      if (!before.isRepo) throw new Error("아직 git 저장소가 아니에요.");
      if (!before.hasRemote) throw new Error("원격 저장소가 연결되지 않았어요.");
      await runGit(root, ["fetch", "--prune"], { timeoutMs: NETWORK_TIMEOUT_MS }).catch(fail);
      const fetched = await this.readStatus(root);
      if (!fetched.upstream) throw new Error("원격에 이 브랜치가 아직 없어서 가져올 게 없어요.");

      await runGit(root, ["merge", "--abort"]).catch(() => {});
      const backup = backupBranchName("local");
      const dirty = (await runGit(root, ["status", "--porcelain"]).catch(fail)).stdout.trim() !== "";
      if (dirty) {
        // 저장소 전체의 변경을 백업 브랜치에만 남긴다 (지금 브랜치는 곧 원격으로 되돌린다).
        await runGit(root, ["add", "-A", ":/"]).catch(fail);
        await runGit(root, ["commit", "--no-verify", "-m", "강제 가져오기 전 백업"]).catch(fail);
      }
      const hasHead = await runGit(root, ["rev-parse", "-q", "--verify", "HEAD"]).then(() => true, () => false);
      if (hasHead) await runGit(root, ["branch", backup, "HEAD"]).catch(fail);
      await runGit(root, ["reset", "--hard", "@{u}"]).catch(fail);
      return {
        outcome: "force-pulled",
        message: hasHead ? `원격과 똑같이 맞췄어요. 이전 상태는 ${backup} 브랜치에 남겨 두었어요.` : "원격과 똑같이 맞췄어요.",
        backupBranch: hasHead ? backup : undefined,
      };
    });
  }

  /**
   * 강제 푸시: 원격을 내 커밋으로 덮어쓴다. 원격에만 있던 커밋은 백업 브랜치(내 컴퓨터)에 남긴다.
   * --force-with-lease라서 방금 확인한 뒤에 누가 새로 올렸다면 덮어쓰지 않고 실패한다.
   */
  forcePush(root: string): Promise<GitOpResult> {
    return this.enqueue(root, async () => {
      const status = await this.readStatus(root);
      if (!status.isRepo) throw new Error("아직 git 저장소가 아니에요.");
      if (!status.hasRemote) throw new Error("원격 저장소가 연결되지 않았어요. 먼저 주소를 연결해 주세요.");
      if (!status.lastCommit) throw new Error("아직 커밋이 없어요. 먼저 커밋해 주세요.");
      if (status.merging) await runGit(root, ["merge", "--abort"]).catch(() => {});

      await runGit(root, ["fetch", "--prune"], { timeoutMs: NETWORK_TIMEOUT_MS }).catch(fail);
      const fetched = await this.readStatus(root);
      let backup: string | undefined;
      if (fetched.upstream && fetched.behind > 0) {
        backup = backupBranchName("remote");
        await runGit(root, ["branch", backup, "@{u}"]).catch(fail);
      }
      const args = fetched.upstream ? ["push", "--force-with-lease"] : ["push", "--force-with-lease", "-u", "origin", "HEAD"];
      await runGit(root, args, { timeoutMs: NETWORK_TIMEOUT_MS }).catch(fail);
      return {
        outcome: "force-pushed",
        message: backup ? `원격을 내 글로 덮어썼어요. 원격에만 있던 커밋은 ${backup} 브랜치에 남겨 두었어요.` : "원격을 내 글로 덮어썼어요.",
        backupBranch: backup,
      };
    });
  }

  /** 커밋 → 가져오기 → 푸시. 충돌하면 거기서 멈춘다. */
  async sync(root: string, settings: GitSettings): Promise<GitOpResult> {
    const commit = await this.commit(root, formatCommitMessage(settings.commitMessage));
    const status = await this.status(root);
    if (!status.hasRemote) return commit;

    const pull = await this.pull(root);
    if (pull.outcome === "conflict") return pull;
    const push = await this.push(root);
    const parts = [
      commit.outcome === "committed" ? "커밋" : null,
      pull.outcome === "fast-forward" || pull.outcome === "merged" ? "가져오기" : null,
      push.outcome === "pushed" ? "푸시" : null,
    ].filter(Boolean);
    return {
      outcome: "synced",
      message: parts.length > 0 ? `동기화했어요 (${parts.join(" → ")})` : "이미 모두 최신이에요.",
    };
  }
}
