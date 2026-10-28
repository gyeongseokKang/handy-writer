// 변경 기록(캐러셀), 목표 분량, 서식 있는 복사를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:history`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const v1 = "# 일기\n\n오늘은 비가 왔다.\n\n산책을 못 했다.\n";
const v2 = "# 일기\n\n오늘은 눈이 왔다.\n\n산책을 못 했다.\n\n대신 책을 읽었다.\n";
const v3 = "# 일기\n\n오늘은 눈이 왔다.\n\n대신 책을 읽었다.\n";

const env = await launchApp({ open: "글", files: { "글.md": v1, "attachments/점.png": fs.readFileSync(path.join(import.meta.dirname, "fixtures", "square.png")) } });
const { app, page, ws, logs } = env;
const file = path.join(ws, "글.md");
const git = (...args) => execFileSync("git", args, { cwd: ws, env: { ...process.env, GIT_AUTHOR_NAME: "작가", GIT_AUTHOR_EMAIL: "a@b.c", GIT_COMMITTER_NAME: "작가", GIT_COMMITTER_EMAIL: "a@b.c" } });
git("init", "-q", "-b", "main");
git("add", "-A");
git("commit", "-q", "-m", "처음 쓴 일기");
for (const [content, message] of [[v2, "날씨 고치고 문단 추가"], [v3, "산책 문단 지움"]]) {
  fs.writeFileSync(file, content);
  git("commit", "-qam", message);
}
await sleep(800);
// 커밋하지 않은 지금 내용
await page.locator(".note-prose p").last().click();
await page.keyboard.press("End");
await page.keyboard.type(" 재밌었다.");
await sleep(1000);

// ── 변경 기록 ──
await page.getByRole("button", { name: "기록", exact: true }).click();
const view = page.getByRole("dialog", { name: "변경 기록" });
await view.waitFor();
await view.locator(".history-card.is-active ins").first().waitFor();
const counter = () => view.locator("[aria-live='polite']").innerText();
assert((await counter()) === "4 / 4", `커밋 3개와 지금 내용으로 4장이 생기고 마지막 장부터 본다 (${await counter()})`);
const active = view.locator(".history-card.is-active");
assert((await active.locator("ins").allInnerTexts()).join("").includes("재밌었다"), "지금 장은 커밋 뒤에 쓴 말을 초록으로 보여준다");
await sleep(900);
await page.screenshot({ path: path.join(OUT, "history-now.png") });

await page.keyboard.press("ArrowLeft");
await sleep(500);
assert((await counter()) === "3 / 4", "←로 이전 버전");
assert((await active.locator("del").allInnerTexts()).join("").includes("산책을 못 했다."), "지운 문단은 빨간 줄로 보인다");
assert((await active.locator("header").innerText()).includes("산책 문단 지움"), "커밋 메시지가 보인다");

await page.keyboard.press("ArrowLeft");
await sleep(150);
const animation = await active.locator("ins").first().evaluate((el) => getComputedStyle(el).animationName);
assert(animation === "history-add", `가운데 카드의 추가 표시는 애니메이션된다 (${animation})`);
await sleep(900);
await page.screenshot({ path: path.join(OUT, "history-v2.png") });
assert((await active.locator("ins").allInnerTexts()).some((t) => t.includes("눈이")) && (await active.locator("del").allInnerTexts()).some((t) => t.includes("비가")), "고친 낱말은 삭제(빨강)와 추가(초록)로 나뉜다");
assert((await view.locator(".history-card").count()) >= 3, "양옆 버전 카드도 보인다 (캐러셀)");

await page.keyboard.press("Home");
await sleep(500);
assert((await counter()) === "1 / 4" && (await active.locator("del").count()) === 0, "Home은 처음 버전으로, 처음 버전은 모두 추가");
await page.keyboard.press("End");
await sleep(300);
assert((await counter()) === "4 / 4", "End는 마지막으로");

await page.keyboard.press("Home");
await page.keyboard.press(" ");
await sleep(1700);
const played = await counter();
assert(played !== "1 / 4", `Space로 재생하면 자동으로 넘어간다 (${played})`);
await page.keyboard.press(" ");

await view.getByRole("list", { name: "버전 목록" }).getByRole("button").nth(1).click();
await sleep(500);
assert((await counter()) === "2 / 4", "타임라인 점을 누르면 그 버전으로 간다");
page.once("dialog", (d) => void d.accept());
await view.getByRole("button", { name: "이 버전으로 되돌리기" }).click();
await sleep(1500);
assert(fs.readFileSync(file, "utf8") === v2, "되돌리면 파일이 그 버전 내용이 된다");
assert((await page.getByRole("dialog", { name: "변경 기록" }).count()) === 0, "되돌리면 기록 창이 닫힌다");
assert((await page.locator(".note-prose").innerText()).includes("산책을 못 했다."), "에디터도 되돌린 내용을 보여준다");

await page.keyboard.press("Control+Shift+H");
await view.waitFor();
await page.keyboard.press("Escape");
await sleep(200);
assert((await view.count()) === 0, "Ctrl+Shift+H로 열고 Esc로 닫는다");

// ── 목표 분량 ──
await page.locator("footer button[aria-label^='글자 수']").click();
const stats = page.getByRole("dialog", { name: "글자 수와 목표 분량" });
assert((await stats.innerText()).includes("200자 원고지"), "원고지 매수가 보인다");
await stats.getByLabel("목표 분량").fill("2");
await stats.getByLabel("목표 단위").selectOption("sheets");
await stats.getByRole("button", { name: "목표 저장" }).click();
await sleep(1200);
assert(fs.readFileSync(file, "utf8").startsWith("---\ngoal: 2매\n---\n\n# 일기"), "목표가 frontmatter에 저장된다");
const goalLabel = await page.locator("footer button[aria-label^='글자 수']").getAttribute("aria-label");
assert(/매 \/ 2매/.test(goalLabel), `아래 막대에 목표 대비 분량이 보인다 (${goalLabel})`);

// ── 서식 있는 복사 ──
await page.keyboard.press("Escape");
await page.locator(".note-prose p").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("**굵게** ");
await sleep(300);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "서식 있는 글로 복사" }).click();
await sleep(500);
const clip = await app.evaluate(async ({ clipboard }) => {
  const [item] = await clipboard.read();
  return { html: await (await item.getType("text/html")).text(), text: await (await item.getType("text/plain")).text() };
});
assert(clip.html.includes("<strong>굵게</strong>") && clip.html.includes("<h1"), `클립보드에 서식 있는 HTML이 들어간다`);
assert(clip.text.includes("오늘은 눈이 왔다.") && !clip.text.includes("<"), "일반 글도 함께 들어간다");
assert(!clip.html.includes("goal:"), "frontmatter는 복사하지 않는다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
