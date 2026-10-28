// AI 초안 만들기에 붙이는 자료(유튜브 자막, 프로젝트 폴더)를 실제 앱에서 확인한다.
// 유튜브 응답은 메인 프로세스의 fetch를 바꿔 흉내 내고, 가짜 claude CLI가 받은 프롬프트와 인자를 본다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:draft-sources`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({ open: "메모", files: { "메모.md": "# 메모\n" } });
const { app, page, aiCalls, logs } = env;
const dialog = page.getByRole("dialog", { name: "AI 초안 만들기" });

// 프로젝트 폴더 (폴더 선택 창은 이 폴더를 고른 것으로 바꾼다)
const project = fs.mkdtempSync(path.join(os.tmpdir(), "hw-proj-"));
fs.writeFileSync(path.join(project, "README.md"), "# 할 일 앱\n오프라인에서도 되는 할 일 관리 앱이에요.\n");
fs.writeFileSync(path.join(project, "package.json"), '{ "name": "todo-app" }\n');
fs.writeFileSync(path.join(project, ".env"), "API_KEY=비밀값\n");
fs.mkdirSync(path.join(project, "src"));
fs.writeFileSync(path.join(project, "src", "main.ts"), "console.log(1)\n");

await app.evaluate(({ dialog: electronDialog }, dir) => {
  electronDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  // 유튜브 내부 API 흉내: 영상 정보와 영어 자동 자막
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (href.includes("youtubei/v1/player")) {
      const { videoId } = JSON.parse(init.body);
      if (videoId === "deadvideo00") return json({ playabilityStatus: { status: "ERROR", reason: "비공개 동영상" } });
      return json({
        playabilityStatus: { status: "OK" },
        videoDetails: { videoId, title: "PR 2,000개 워크플로우", author: "Tech Bridge", lengthSeconds: "2282", shortDescription: "에이전트와 일하는 법" },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en", languageCode: "en", kind: "asr", name: { runs: [{ text: "영어 (자동 생성됨)" }] } }] } },
      });
    }
    if (href.includes("timedtext")) return json({ events: [{ segs: [{ utf8: "Hi, my name is Lauren." }] }, { segs: [{ utf8: " I shipped 2,000 pull requests." }] }] });
    return realFetch(url, init);
  };
}, project);

await page.getByRole("tab", { name: "AI" }).click();
await page.getByRole("button", { name: "기본정보로 목차·초안 만들기" }).click();
await dialog.waitFor();

// 주제 칸에 유튜브 주소를 붙여넣으면 자료로 불러오고, 비어 있던 주제는 영상 제목으로 채운다
await page.evaluate(() => {
  const input = document.querySelector("#draft-topic");
  const data = new DataTransfer();
  data.setData("text/plain", "https://youtu.be/zkmvCDSxqdc?si=abc");
  input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
});
const sources = dialog.getByRole("list", { name: "붙인 자료" });
await sources.getByText("PR 2,000개 워크플로우").waitFor();
assert((await dialog.locator("#draft-topic").inputValue()) === "PR 2,000개 워크플로우", "주소를 붙여넣으면 주제가 영상 제목으로 채워진다 (주소는 칸에 들어가지 않는다)");
const meta = await sources.locator("li").first().innerText();
assert(meta.includes("Tech Bridge") && meta.includes("38:02") && meta.includes("영어 (자동 생성됨)"), `영상의 채널, 길이, 자막 언어가 보인다 (${meta.replace(/\n/g, " / ")})`);

// 같은 영상은 한 번만, 볼 수 없는 영상은 알려 준다
await dialog.getByLabel("유튜브 주소").fill("https://www.youtube.com/watch?v=zkmvCDSxqdc");
await dialog.getByRole("button", { name: "불러오기" }).click();
await sleep(400);
assert((await sources.locator("li").count()) === 1, "같은 영상은 한 번만 붙는다");
await dialog.getByLabel("유튜브 주소").fill("https://www.youtube.com/watch?v=deadvideo00");
await dialog.getByLabel("유튜브 주소").press("Enter");
await page.getByText("이 영상은 불러올 수 없어요: 비공개 동영상").waitFor();
ok("볼 수 없는 영상은 이유를 알려 준다");

// 프로젝트 폴더
await dialog.getByRole("button", { name: "프로젝트 폴더" }).click();
await sources.getByText(path.basename(project), { exact: true }).waitFor();
assert((await sources.locator("li").nth(1).innerText()).includes("파일 3개"), "프로젝트 폴더와 파일 수가 보인다 (숨김 파일은 세지 않는다)");
await page.screenshot({ path: path.join(OUT, "draft-sources.png") });

// 목차 만들기: 자막과 프로젝트 요약이 프롬프트에 들어가고, 그 폴더만 읽기 도구로 열린다
await dialog.getByRole("button", { name: "목차 만들기" }).click();
await dialog.getByRole("button", { name: "이 목차로 초안 쓰기" }).waitFor();
const call = aiCalls().at(-1);
assert(call.input.includes('<youtube title="PR 2,000개 워크플로우" channel="Tech Bridge"') && call.input.includes("I shipped 2,000 pull requests."), "목차 요청에 영상 자막이 들어간다");
assert(call.input.includes(`<project name="${path.basename(project)}"`) && call.input.includes("오프라인에서도 되는 할 일 관리 앱"), "목차 요청에 프로젝트 README가 들어간다");
assert(!call.input.includes("비밀값"), "프로젝트의 .env 값은 보내지 않는다");
assert(call.args[call.args.indexOf("--tools") + 1] === "Read,Glob,Grep" && call.args[call.args.indexOf("--add-dir") + 1] === project, "프로젝트 폴더만 읽기 도구로 열어 준다");

await dialog.getByRole("button", { name: "이 목차로 초안 쓰기" }).click();
await dialog.getByRole("button", { name: "새 글로 만들기" }).waitFor();
await page.waitForFunction(() => !document.querySelector("[role=dialog] [role=status]"));
assert(aiCalls().at(-1).input.includes("<transcript"), "초안 요청에도 자료가 함께 간다");

// 자료를 빼면 다음 요청에는 들어가지 않는다
await dialog.getByRole("button", { name: "목차" }).click();
await dialog.getByRole("button", { name: "기본정보" }).click();
await dialog.getByRole("button", { name: "PR 2,000개 워크플로우 빼기" }).click();
await dialog.getByRole("button", { name: `${path.basename(project)} 빼기` }).click();
await dialog.getByRole("button", { name: "목차 새로 만들기" }).click();
await dialog.getByRole("button", { name: "이 목차로 초안 쓰기" }).waitFor();
const plain = aiCalls().at(-1);
assert(!plain.input.includes("<sources>") && plain.args[plain.args.indexOf("--tools") + 1] === "", "자료를 빼면 자료와 도구 없이 보낸다");
ok("초안 자료 확인");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
