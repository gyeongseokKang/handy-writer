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
