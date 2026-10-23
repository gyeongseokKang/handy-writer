import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { SYSTEM_PROMPT } from "../../shared/ai-prompt";
import type { AiStatus } from "../../shared/ai";

const RUN_TIMEOUT_MS = 180_000;
const PATH_MARKER = "__HANDY_WRITER_PATH__";

export type StreamPiece = { kind: "delta"; text: string } | { kind: "result"; text: string; isError: boolean };

/** `claude -p --output-format stream-json`가 한 줄씩 내보내는 JSON에서 필요한 조각만 뽑는다. */
export function parseStreamLine(line: string): StreamPiece | null {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, any>;

  if (record["type"] === "stream_event") {
    const delta = record["event"]?.delta;
    if (record["event"]?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
      return { kind: "delta", text: delta.text };
    }
    return null;
  }
  if (record["type"] === "result") {
    return { kind: "result", text: String(record["result"] ?? ""), isError: record["is_error"] === true };
  }
  return null;
}

let loginPathPromise: Promise<string> | null = null;

/** macOS에서 Dock으로 연 앱은 터미널의 PATH를 물려받지 못해서, 로그인 셸의 PATH를 따로 읽는다. */
function loginShellPath(): Promise<string> {
  if (process.platform === "win32") return Promise.resolve(process.env["PATH"] ?? "");
  loginPathPromise ??= new Promise((resolve) => {
    const shell = process.env["SHELL"] || "/bin/sh";
    execFile(shell, ["-lc", `printf "${PATH_MARKER}%s${PATH_MARKER}" "$PATH"`], { timeout: 5000 }, (error, stdout) => {
      const match = new RegExp(`${PATH_MARKER}(.*)${PATH_MARKER}`, "s").exec(stdout);
      resolve(!error && match?.[1] ? match[1] : "");
    });
  });
  return loginPathPromise;
}

async function searchPath(): Promise<string[]> {
  const home = homedir();
  const fixed = [
    join(home, ".claude", "local"),
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const dirs = [...(await loginShellPath()).split(delimiter), ...(process.env["PATH"] ?? "").split(delimiter), ...fixed];
  return [...new Set(dirs.filter(Boolean))];
}

export async function findClaude(): Promise<string | null> {
  const override = process.env["HANDY_WRITER_CLAUDE_PATH"];
  if (override) return existsSync(override) ? override : null;
  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"];
  for (const dir of await searchPath()) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function childEnv(exe: string): Promise<NodeJS.ProcessEnv> {
  // npm으로 설치한 claude는 `#!/usr/bin/env node`라서, 같은 폴더와 로그인 셸 PATH를 함께 넘긴다.
  const path = [dirname(exe), ...(await searchPath())].join(delimiter);
  return { ...process.env, PATH: path };
}

export async function claudeStatus(): Promise<AiStatus> {
  const exe = await findClaude();
  if (!exe) {
    return {
      available: false,
      reason: "Claude Code CLI(`claude`)를 찾지 못했어요. 설치하고 터미널에서 한 번 로그인해 주세요.",
    };
  }
  const env = await childEnv(exe);
  return new Promise((resolve) => {
    execFile(exe, ["--version"], { env, timeout: 10_000, shell: process.platform === "win32" }, (error, stdout) => {
      if (error) resolve({ available: false, path: exe, reason: `claude를 실행하지 못했어요: ${error.message}` });
      else resolve({ available: true, path: exe, version: stdout.trim() });
    });
  });
}

let systemPromptFile: Promise<string> | null = null;

/** 시스템 프롬프트는 줄바꿈과 따옴표가 많아서, 인자 대신 파일로 넘긴다 (Windows 인자 길이와 인용 문제도 피한다). */
function ensureSystemPromptFile() {
  systemPromptFile ??= mkdtemp(join(tmpdir(), "handy-writer-")).then(async (dir) => {
    const file = join(dir, "system-prompt.txt");
    await writeFile(file, SYSTEM_PROMPT, "utf8");
    return file;
  });
  return systemPromptFile;
}

interface RunOptions {
  exe: string;
  cwd: string;
  prompt: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

/** 도구를 모두 끈 채로 `claude -p`를 실행하고 결과 글을 돌려준다. 프롬프트는 stdin으로 넘긴다. */
export async function runClaude({ exe, cwd, prompt, signal, onDelta }: RunOptions): Promise<string> {
  const promptFile = await ensureSystemPromptFile();
  const env = await childEnv(exe);
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools",
    "",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--append-system-prompt-file",
    promptFile,
  ];

  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("취소했어요."));

    const child = spawn(exe, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(exe),
    });

    let buffer = "";
    let streamed = "";
    let result: { text: string; isError: boolean } | null = null;
    let stderr = "";
    let settled = false;

    const finish = (error: Error | null, text = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(text);
    };

    const onAbort = () => {
      child.kill();
      finish(new Error("취소했어요."));
    };
    signal.addEventListener("abort", onAbort);

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("시간이 너무 오래 걸려서 중단했어요."));
    }, RUN_TIMEOUT_MS);

    const handleLine = (line: string) => {
      const piece = parseStreamLine(line.trim());
      if (!piece) return;
      if (piece.kind === "delta") {
        streamed += piece.text;
        onDelta(piece.text);
      } else {
        result = { text: piece.text, isError: piece.isError };
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });

    child.on("error", (error) => finish(new Error(`claude를 실행하지 못했어요: ${error.message}`)));
    child.on("close", (code) => {
      if (buffer.trim()) handleLine(buffer);
      const final = result as { text: string; isError: boolean } | null;
      if (final?.isError) return finish(new Error(final.text || "AI 요청이 실패했어요."));
      if (final) return finish(null, final.text);
      if (code === 0 && streamed) return finish(null, streamed);
      finish(new Error(stderr.trim() || `claude가 결과 없이 종료됐어요 (종료 코드 ${code}).`));
    });

    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}
