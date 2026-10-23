import { execFile } from "node:child_process";
import { delimiter } from "node:path";

import { loginShellPath } from "../shell-env";

export class GitError extends Error {
  constructor(
    message: string,
    readonly code: number | string | null,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message);
  }
}

export interface RunOptions {
  timeoutMs?: number;
  /** 상태 조회처럼 읽기만 하는 명령은 index.lock을 잡지 않게 해서 다른 git 프로그램(Obsidian Git 등)과 부딪치지 않는다. */
  readOnly?: boolean;
  input?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** 인자를 배열로 넘겨서 셸을 거치지 않고 `git`을 실행한다. 메시지가 바뀌지 않도록 로케일을 고정하고, 인증 프롬프트로 멈추지 않게 한다. */
export async function runGit(cwd: string, args: string[], options: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const path = [process.env["PATH"] ?? "", await loginShellPath()].filter(Boolean).join(delimiter);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: path,
    LC_ALL: "C",
    GIT_TERMINAL_PROMPT: "0",
    ...(options.readOnly ? { GIT_OPTIONAL_LOCKS: "0" } : {}),
  };

  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      { cwd, env, timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr });
        const code = (error as NodeJS.ErrnoException & { code?: number | string }).code ?? null;
        reject(new GitError(stderr.trim() || error.message, code, stderr, stdout));
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}

export const isGitMissing = (error: unknown) => error instanceof GitError && error.code === "ENOENT";
