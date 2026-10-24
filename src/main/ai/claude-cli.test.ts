import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseStreamLine, runClaude, WEB_TOOLS } from "./claude-cli";

describe("parseStreamLine", () => {
  it("text_delta만 조각으로 꺼내고 thinking 같은 다른 조각은 무시한다", () => {
    const delta = JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "안녕" } } });
    const thinking = JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "음" } } });
    expect(parseStreamLine(delta)).toEqual({ kind: "delta", text: "안녕" });
    expect(parseStreamLine(thinking)).toBeNull();
  });

  it("result 이벤트의 글과 오류 여부를 읽는다", () => {
    expect(parseStreamLine(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "끝" }))).toEqual({
      kind: "result",
      text: "끝",
      isError: false,
    });
    expect(parseStreamLine(JSON.stringify({ type: "result", is_error: true, result: "로그인이 필요해요" }))).toMatchObject({ isError: true });
  });

  it("새 응답 턴 시작과 도구 사용 시작을 알아본다", () => {
    expect(parseStreamLine(JSON.stringify({ type: "stream_event", event: { type: "message_start" } }))).toEqual({ kind: "turn" });
    const tool = { type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "WebSearch" } } };
    expect(parseStreamLine(JSON.stringify(tool))).toEqual({ kind: "tool", name: "WebSearch" });
    const text = { type: "stream_event", event: { type: "content_block_start", content_block: { type: "text", text: "" } } };
    expect(parseStreamLine(JSON.stringify(text))).toBeNull();
  });

  it("JSON이 아니거나 관심 없는 줄은 null이다", () => {
    expect(parseStreamLine("not json")).toBeNull();
    expect(parseStreamLine("")).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init" }))).toBeNull();
  });
});

// 실제 claude 대신 같은 형식으로 출력하는 가짜 CLI로 프로세스 실행, stdin, 스트리밍, 취소를 확인한다.
const posix = process.platform !== "win32";
let dir: string;

async function fakeCli(name: string, body: string) {
  const file = join(dir, name);
  await writeFile(file, `#!/usr/bin/env node\n${body}`);
  await chmod(file, 0o755);
  return file;
}

const emit = (obj: unknown) => `process.stdout.write(JSON.stringify(${JSON.stringify(obj)}) + "\\n");`;
const delta = (text: string) => emit({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "handy-writer-fakecli-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.skipIf(!posix)("runClaude", () => {
  it("프롬프트를 stdin으로 넘기고 조각을 순서대로 받아 최종 글을 돌려준다", async () => {
    const exe = await fakeCli(
      "echo-cli",
      `let input = ""; process.stdin.on("data", (c) => (input += c)); process.stdin.on("end", () => {
         ${delta("받은 ")}
         process.stdout.write(JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "글" } } }) + "\\n");
         process.stdout.write(JSON.stringify({ type: "result", is_error: false, result: JSON.stringify({ input, args: process.argv.slice(2) }) }) + "\\n");
       });`,
    );
    const deltas: string[] = [];
    const out = await runClaude({ exe, cwd: dir, prompt: "교정할 글 ✓", signal: new AbortController().signal, onDelta: (t) => deltas.push(t) });
    const { input, args } = JSON.parse(out) as { input: string; args: string[] };

    expect(deltas).toEqual(["받은 ", "글"]);
    expect(input).toBe("교정할 글 ✓");
    expect(args).toContain("stream-json");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--append-system-prompt-file");
  });

  it("웹 검색을 켜면 두 도구만 허용하고, 끄면 모든 도구를 끈다", async () => {
    const exe = await fakeCli(
      "args-cli",
      `process.stdin.resume(); process.stdin.on("end", () => { ${emit({ type: "result", is_error: false, result: "" })}; });
       process.stdout.write(""); require("fs").writeFileSync(process.argv[1] + ".args", JSON.stringify(process.argv.slice(2)));`,
    );
    const read = async () => JSON.parse(await (await import("node:fs/promises")).readFile(`${exe}.args`, "utf8")) as string[];

    await runClaude({ exe, cwd: dir, prompt: "x", signal: new AbortController().signal, onDelta: () => {}, web: true });
    const on = await read();
    expect(on[on.indexOf("--tools") + 1]).toBe(WEB_TOOLS);
    expect(on[on.indexOf("--allowedTools") + 1]).toBe(WEB_TOOLS);

    await runClaude({ exe, cwd: dir, prompt: "x", signal: new AbortController().signal, onDelta: () => {} });
    const off = await read();
    expect(off[off.indexOf("--tools") + 1]).toBe("");
    expect(off).not.toContain("--allowedTools");
  });

  it("도구를 쓰는 동안 상태를 알리고, 도구 뒤의 새 턴이 시작되면 앞의 중간 발화를 지우게 한다", async () => {
    const turn = emit({ type: "stream_event", event: { type: "message_start" } });
    const tool = emit({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "WebSearch" } } });
    const exe = await fakeCli(
      "turns-cli",
      `process.stdin.resume(); process.stdin.on("end", () => {
         ${turn} ${delta("검색해 볼게요. ")} ${tool}
         ${turn} ${delta("최종 ")} ${delta("답변")}
         ${emit({ type: "result", is_error: false, result: "최종 답변" })}
       });`,
    );
    const events: string[] = [];
    const out = await runClaude({
      exe,
      cwd: dir,
      prompt: "x",
      signal: new AbortController().signal,
      web: true,
      onDelta: (t) => events.push(`delta:${t}`),
      onStatus: (t) => events.push(`status:${t}`),
      onReset: () => events.push("reset"),
    });

    expect(out).toBe("최종 답변");
    expect(events).toEqual(["delta:검색해 볼게요. ", "status:웹 검색 중…", "reset", "delta:최종 ", "delta:답변"]);
  });

  it("is_error 결과는 그 메시지로 실패한다", async () => {
    const exe = await fakeCli("err-cli", `process.stdin.resume(); process.stdin.on("end", () => { ${emit({ type: "result", is_error: true, result: "로그인이 필요해요" })} });`);
    await expect(runClaude({ exe, cwd: dir, prompt: "x", signal: new AbortController().signal, onDelta: () => {} })).rejects.toThrow("로그인이 필요해요");
  });

  it("결과 없이 비정상 종료하면 stderr를 오류로 알려준다", async () => {
    const exe = await fakeCli("crash-cli", `process.stdin.resume(); process.stdin.on("end", () => { console.error("boom"); process.exit(3); });`);
    await expect(runClaude({ exe, cwd: dir, prompt: "x", signal: new AbortController().signal, onDelta: () => {} })).rejects.toThrow("boom");
  });

  it("취소하면 프로세스를 끝내고 바로 실패한다", async () => {
    const exe = await fakeCli("slow-cli", `process.stdin.resume(); setTimeout(() => {}, 60000);`);
    const controller = new AbortController();
    const started = Date.now();
    const promise = runClaude({ exe, cwd: dir, prompt: "x", signal: controller.signal, onDelta: () => {} });
    setTimeout(() => controller.abort(), 200);
    await expect(promise).rejects.toThrow("취소");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("parseLoggedIn", () => {
  it("auth status JSON에서 로그인 여부를 읽고, 모르면 null", async () => {
    const { parseLoggedIn } = await import("./claude-cli");
    expect(parseLoggedIn('{"loggedIn": true, "authMethod": "oauth_token"}')).toBe(true);
    expect(parseLoggedIn('{"loggedIn": false}')).toBe(false);
    expect(parseLoggedIn("Not logged in")).toBeNull();
    expect(parseLoggedIn("")).toBeNull();
  });
});

describe("friendlyError", () => {
  it("로그인 오류에는 해결 방법을 덧붙이고, 다른 오류는 그대로 둔다", async () => {
    const { friendlyError } = await import("./claude-cli");
    expect(friendlyError("Not logged in · Please run /login")).toContain("claude setup-token");
    expect(friendlyError("rate limited")).toBe("rate limited");
  });
});
