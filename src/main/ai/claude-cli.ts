import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

import { loginShellAuthEnv, loginShellPath } from "../shell-env";
import { SYSTEM_PROMPT } from "../../shared/ai-prompt";
import type { AiStatus } from "../../shared/ai";

const RUN_TIMEOUT_MS = 180_000;
/** 웹 검색(여러 번 검색하고 페이지를 읽는다)과 긴 초안은 더 오래 걸린다. */
const LONG_RUN_TIMEOUT_MS = 300_000;

export const WEB_TOOLS = "WebSearch,WebFetch";

export type StreamPiece =
  | { kind: "delta"; text: string }
  /** 새 응답 턴이 시작됐다 (도구를 쓴 뒤 이어지는 응답) */
  | { kind: "turn" }
  | { kind: "tool"; name: string }
  | { kind: "result"; text: string; isError: boolean };

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
    const event = record["event"];
    if (event?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
      return { kind: "delta", text: delta.text };
    }
    if (event?.type === "message_start") return { kind: "turn" };
    if (event?.type === "content_block_start" && event.content_block?.type === "tool_use" && typeof event.content_block.name === "string") {
      return { kind: "tool", name: event.content_block.name };
    }
    return null;
  }
  if (record["type"] === "result") {
    return { kind: "result", text: String(record["result"] ?? ""), isError: record["is_error"] === true };
  }
  return null;
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

/** 로그인이 안 된 경우는 영어 안내만 나와서, 무엇을 하면 되는지 덧붙인다. */
export function friendlyError(message: string): string {
  if (/not logged in|please run \/login/i.test(message)) {
    return `${message}\n\n터미널에서 \`claude\`를 실행해 \`/login\`으로 로그인하면 돼요. 이미 로그인했는데도 이 메시지가 나오면, 앱이 터미널과 다른 환경에서 열린 것일 수 있어요. 터미널에서 \`claude setup-token\`으로 만든 토큰을 \`CLAUDE_CODE_OAUTH_TOKEN\`으로 설정해 보세요.`;
  }
  return message;
}

async function childEnv(exe: string): Promise<NodeJS.ProcessEnv> {
  // npm으로 설치한 claude는 `#!/usr/bin/env node`라서, 같은 폴더와 로그인 셸 PATH를 함께 넘긴다.
  const path = [dirname(exe), ...(await searchPath())].join(delimiter);
  // 앱을 연 환경에 이미 있는 값이 우선이고, 없는 로그인 관련 변수만 로그인 셸에서 채운다.
  return { ...(await loginShellAuthEnv()), ...process.env, PATH: path };
}

export async function claudeStatus(): Promise<AiStatus> {
  const exe = await findClaude();
  if (!exe) {
    return {
      available: false,
      problem: "missing",
      reason: "Claude Code CLI(`claude`)를 찾지 못했어요.",
    };
  }
  const env = await childEnv(exe);
  const shell = process.platform === "win32";
  const version = await new Promise<{ ok: true; text: string } | { ok: false; message: string }>((resolve) => {
    execFile(exe, ["--version"], { env, timeout: 10_000, shell }, (error, stdout) =>
      resolve(error ? { ok: false, message: error.message } : { ok: true, text: stdout.trim() }),
    );
  });
  if (!version.ok) return { available: false, path: exe, problem: "error", reason: `claude를 실행하지 못했어요: ${version.message}` };

  // 로그인 여부. 오래된 CLI처럼 `auth status`를 모르거나 확인하지 못하면 막지 않고 실제 요청에서 알려준다.
  const loggedIn = await new Promise<boolean | null>((resolve) => {
    execFile(exe, ["auth", "status"], { env, timeout: 10_000, shell }, (_error, stdout) => resolve(parseLoggedIn(stdout)));
  });
  if (loggedIn === false) return { available: false, path: exe, version: version.text, problem: "login", reason: "Claude Code에 로그인되어 있지 않아요." };
  return { available: true, path: exe, version: version.text };
}

/** `claude auth status`의 JSON 출력에서 로그인 여부를 읽는다. 읽을 수 없으면 null. */
export function parseLoggedIn(stdout: string): boolean | null {
  try {
    const value = (JSON.parse(stdout) as { loggedIn?: unknown }).loggedIn;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
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
  /** 웹 검색(WebSearch, WebFetch)을 허용한다. 끄면 모든 도구가 꺼진다. */
  web?: boolean;
  onStatus?: (text: string) => void;
  /** 도구를 쓰기 전의 중간 발화를 지우라는 신호 */
  onReset?: () => void;
  /** 긴 글을 쓰는 요청이라 시간 제한을 늘린다. */
  long?: boolean;
}

const TOOL_STATUS: Record<string, string> = { WebSearch: "웹 검색 중…", WebFetch: "웹 페이지 읽는 중…" };

/** 도구를 모두 끈 채로 `claude -p`를 실행하고 결과 글을 돌려준다. 프롬프트는 stdin으로 넘긴다. */
export async function runClaude({ exe, cwd, prompt, signal, onDelta, web = false, onStatus, onReset, long = false }: RunOptions): Promise<string> {
  const promptFile = await ensureSystemPromptFile();
  const env = await childEnv(exe);
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools",
    web ? WEB_TOOLS : "",
    ...(web ? ["--allowedTools", WEB_TOOLS] : []),
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
    let turns = 0;
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
    }, web || long ? LONG_RUN_TIMEOUT_MS : RUN_TIMEOUT_MS);

    const handleLine = (line: string) => {
      const piece = parseStreamLine(line.trim());
      if (!piece) return;
      if (piece.kind === "delta") {
        streamed += piece.text;
        onDelta(piece.text);
      } else if (piece.kind === "turn") {
        // 두 번째 턴부터는 도구 결과를 받은 뒤의 응답이다. 앞의 중간 발화는 지운다.
        if (++turns > 1 && streamed) {
          streamed = "";
          onReset?.();
        }
      } else if (piece.kind === "tool") {
        onStatus?.(TOOL_STATUS[piece.name] ?? `${piece.name} 실행 중…`);
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
      if (final?.isError) return finish(new Error(friendlyError(final.text) || "AI 요청이 실패했어요."));
      if (final) return finish(null, final.text);
      if (code === 0 && streamed) return finish(null, streamed);
      finish(new Error(friendlyError(stderr.trim()) || `claude가 결과 없이 종료됐어요 (종료 코드 ${code}).`));
    });

    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}
