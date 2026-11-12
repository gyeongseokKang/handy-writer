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

if (args[0] === "auth" && args[1] === "status") {
  console.log(JSON.stringify({ loggedIn: process.env.FAKE_CLAUDE_LOGGED_OUT !== "1" }));
  process.exit(0);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", async () => {
  if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, input }) + "\n");

  const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const delta = (text) => out({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } });

  if (input.includes("SLOW")) await new Promise((resolve) => setTimeout(resolve, 60_000));
  if (input.includes("FAIL")) return out({ type: "result", is_error: true, result: "로그인이 필요해요. 터미널에서 claude를 실행해 주세요." });

  // 초안 만들기: 목차 요청이면 받은 주제로 목차를, 목차가 함께 오면 그 제목으로 초안을 만든다.
  const topic = input.match(/<brief>\n- 주제: ([^\n]*)/)?.[1];
  if (topic !== undefined) {
    const outline = input.match(/<outline>\n([\s\S]*?)\n<\/outline>/)?.[1];
    const answer =
      outline === undefined
        ? `## ${topic} 시작하기\n- 왜 필요한가\n## 실천 방법\n- 하루 10분부터\n### 준비물\n- 신발\n## 마치며\n- 정리`
        : outline
            .split("\n")
            .filter((line) => line.startsWith("#"))
            .map((line) => `${line}\n\n${line.replace(/^#+\s*/, "")}에 대한 초안 문단입니다.`)
            .join("\n\n");
    delta(answer.slice(0, 15));
    delta(answer.slice(15));
    return out({ type: "result", subtype: "success", is_error: false, result: answer });
  }

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
  // 퇴고: 실제 모델처럼 태그 밖에 생각을 쓰고, 고친 글과 고친 점을 태그로 나눠 답한다. 받은 퇴고 기준의 첫 줄을 고친 점에 드러낸다.
  if (text !== undefined && input.includes("<revise_rules>")) {
    const rule = input.match(/<revise_rules>\n([^\n]*)/)?.[1] ?? "";
    const revised = text.replace(/정말 /g, "").replace(/사실 /g, "").replace(/^## 둘째$/m, "## 둘째: 매일 쓰는 이유");
    const answer = `글을 읽어 보니 군더더기가 있다.\n<revised>\n${revised}</revised>\n<notes>\n- 정말 글쓰기가 → 글쓰기가 / 군더더기 '정말'을 뺌\n- 사실 매일 → 매일 / 군더더기 '사실'을 뺌, 기준: ${rule.replace(/^[-*]\s*/, "")}\n</notes>\n<suggestions>\n- 둘째 절이 짧으니 첫 절과 합치기 / 2문단 이하라서\n</suggestions>`;
    // 실제 모델처럼 먼저 생각하고(진행 단계 표시를 시험할 수 있게 잠깐 멈춘다), 고친 글을 조금씩 쓴다.
    out({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "thinking" } } });
    await pause(1500);
    const cut = answer.indexOf("<revised>") + 12;
    delta(answer.slice(0, cut));
    await pause(1000);
    delta(answer.slice(cut));
    return out({ type: "result", subtype: "success", is_error: false, result: answer });
  }
  const result =
    text !== undefined
      ? text.replace(/않계/g, "안 계").replace(/되돌아 왔다/g, "되돌아왔다")
      : "이어서 쓴 문장입니다. 자세한 내용은 [[글쓰기 규칙]]을 참고하세요.";

  // 이어쓰기는 실제 모델처럼 태그 밖에 생각을 늘어놓고 <continuation> 안에 답을 쓴다 (앱이 태그 안만 쓰는지 시험).
  const answer = text === undefined && input.includes("<continuation>")
    ? `이 문단은 소제목 아래에 있고 after와 이어져야 한다.\n<continuation>\n${result}</continuation>\n그러니 이렇게 쓰면 된다.`
    : result;
  const mid = Math.ceil(answer.length / 2);
  delta(answer.slice(0, mid));
  delta(answer.slice(mid));
  out({ type: "result", subtype: "success", is_error: false, result: answer });
});
