#!/usr/bin/env node
// E2E용 가짜 claude CLI. 실제와 같은 stream-json 형식으로 출력한다.
//  - 프롬프트에 FAIL이 있으면 오류 결과, SLOW가 있으면 오래 걸려서 취소를 시험할 수 있다.
//  - 받은 인자와 stdin은 FAKE_CLAUDE_LOG 파일에 남긴다.
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("9.9.9 (Claude Code)");
  process.exit(0);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, input }) + "\n");

  const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
  const delta = (text) => out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });

  if (input.includes("SLOW")) await new Promise((resolve) => setTimeout(resolve, 60_000));
  if (input.includes("FAIL")) return out({ type: "result", is_error: true, result: "로그인이 필요해요. 터미널에서 claude를 실행해 주세요." });

  // 템플릿 블록 요청: 받은 지침과 본문 맥락을 결과에 그대로 드러내서 테스트가 확인할 수 있게 한다.
  const instruction = input.match(/지침:\n([^\n]*)/)?.[1];
  if (instruction !== undefined) {
    const web = args.some((arg) => arg.includes("WebSearch"));
    const context = input.match(/<context>\n([\s\S]*?)\n<\/context>/)?.[1] ?? "";
    const turn = () => out({ type: "stream_event", event: { type: "message_start" } });
    if (web) {
      turn();
      delta("검색해 볼게요. ");
      out({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "WebSearch" } } });
      await new Promise((resolve) => setTimeout(resolve, 900));
      turn();
    }
    const lines = [`**${instruction}**`, "", `- 본문 맥락: ${context.split("\n")[0] ?? ""} (${context.length}자)`, `- 웹 검색: ${web ? "사용" : "안 함"}`];
    if (web) lines.push("", "출처: [예시 문서](https://example.com/doc)");
    const answer = lines.join("\n");
    delta(answer.slice(0, 20));
    delta(answer.slice(20));
    return out({ type: "result", subtype: "success", is_error: false, result: answer });
  }

  const text = input.match(/<text>\n([\s\S]*?)\n<\/text>/)?.[1];
  const result =
    text !== undefined
      ? text.replace(/않계/g, "안 계").replace(/되돌아 왔다/g, "되돌아왔다")
      : "이어서 쓴 문장입니다. 자세한 내용은 [[글쓰기 규칙]]을 참고하세요.";

  const mid = Math.ceil(result.length / 2);
  delta(result.slice(0, mid));
  delta(result.slice(mid));
  out({ type: "result", subtype: "success", is_error: false, result });
});
