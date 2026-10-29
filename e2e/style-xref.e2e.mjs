// 문장 다듬기 표시와 그림·표 번호·참조를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:style-xref`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const longSentence = `${"아주 길게 이어지는 문장을 일부러 만들어 봅니다 ".repeat(4)}끝났다.`;
const source = [
  "# 다듬기",
  "",
  "우리는 미리 예약했고 결과가 보여진다.",
  "",
  longSentence,
  "",
  "[[#^fig-b]]와 [[#^tbl-score]]를 보세요.",
  "",
  "![[점.png]]",
  "",
  "첫 그림 ^fig-a",
  "",
  "![[점.png]]",
  "",
  "둘째 그림 ^fig-b",
  "",
  "| 이름 | 점수 |",
  "| --- | --- |",
  "| 가 | 1 |",
  "",
  "점수 ^tbl-score",
  "",
].join("\n");
const png = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "square.png"));
const env = await launchApp({ files: { "다듬기.md": source, "attachments/점.png": png } });
const { app, page, ws, logs } = env;
const file = path.join(ws, "다듬기.md");
// 온라인 맞춤법 검사는 끄고(규칙 기반만) 연다.
await page.evaluate(() => localStorage.setItem("handy-writer:spellcheck-online", "false"));
await page.reload();
await page.click("nav[aria-label='글 목록'] >> text=다듬기");
await page.waitForSelector(".note-prose .style-issue");

// ── 문장 다듬기 ──
const styled = await page.locator(".note-prose .style-issue").evaluateAll((els) => els.map((el) => [el.getAttribute("data-spell"), el.textContent]));
const ids = styled.map(([id]) => id);
assert(ids.includes("style:미리 예약") && ids.some((id) => id?.startsWith("style:보여진")), `겹말과 이중 피동에 다듬기 표시 (${ids.join(", ")})`);
assert(ids.includes("style:long"), "긴 문장은 문장 전체를 옅은 바탕으로 표시");
const underline = await page.locator(".note-prose .style-issue:not(.style-long)").first().evaluate((el) => getComputedStyle(el).textDecorationStyle);
assert(underline === "dotted", `다듬기는 맞춤법(물결)과 다른 점선 밑줄 (${underline})`);

await page.locator(".note-prose [data-spell='style:미리 예약']").hover();
const popover = page.getByRole("dialog", { name: "문장 다듬기 제안" });
await popover.waitFor({ timeout: 3000 });
assert((await popover.innerText()).includes("예약"), "올리면 다듬기 제안 창이 뜬다");
await popover.getByRole("button", { name: "바꾸기" }).click();
await sleep(1200);
assert(fs.readFileSync(file, "utf8").includes("우리는 예약했고"), "바꾸기로 겹말을 고친다");

await page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: /맞춤법/ }).click();
const panel = page.getByRole("region", { name: "맞춤법 목록" });
const longRow = panel.getByRole("button", { name: /다듬기: 문장이 \d+자예요/ });
assert((await longRow.count()) === 1, "맞춤법 탭에 긴 문장 항목이 ‘다듬기’로 보인다");
await longRow.click();
assert((await panel.getByRole("listitem").filter({ has: longRow }).getByRole("button", { name: "고치기" }).count()) === 0, "고칠 말이 없는 항목에는 고치기 버튼이 없다");
await page.screenshot({ path: path.join(OUT, "style-lint.png") });

await page.getByRole("button", { name: "맞춤법 설정" }).click();
await page.getByLabel("문장 다듬기 표시").uncheck();
await sleep(300);
assert((await page.locator(".note-prose .style-issue").count()) === 0, "설정에서 끄면 다듬기 표시가 사라진다");
await page.getByLabel("문장 다듬기 표시").check();
await page.keyboard.press("Escape");

// ── 그림·표 번호 ──
const captionLabels = () => page.locator(".note-prose p.caption").evaluateAll((els) => els.map((el) => el.getAttribute("data-caption")));
const captions = await captionLabels();
assert(JSON.stringify(captions.map((t) => t.trim())) === '["그림 1.","그림 2.","표 1."]', `캡션 앞에 번호가 붙는다 (${captions})`);
const refs = await page.locator(".note-prose .wikilink.xref").evaluateAll((els) => els.map((el) => getComputedStyle(el, "::before").content));
assert(JSON.stringify(refs) === JSON.stringify(['"그림 2"', '"표 1"']), `참조는 번호로 보인다 (${refs})`);
await page.locator(".note-prose .wikilink.xref").first().click();
await sleep(500);
const caret = await page.evaluate(() => {
  const node = window.getSelection()?.anchorNode;
  return (node instanceof Element ? node : node?.parentElement)?.closest("p")?.textContent ?? "";
});
assert(caret.includes("둘째 그림"), `참조를 누르면 그 캡션으로 간다 (${caret})`);
await page.screenshot({ path: path.join(OUT, "xref.png") });

// 새 그림 번호를 넣고 [[# 로 참조하기
// 참조 링크를 누르면 캡션으로 가 버리므로 문단 오른쪽 끝 빈 곳을 누른다.
const refLocator = page.locator(".note-prose p", { hasText: "를 보세요" }).first();
// 앞서 누른 참조의 부드러운 스크롤이 끝날 때까지 기다렸다가(locator.click이 위치가 멈추기를 기다린다) 누른다.
await sleep(800);
const refBox = await refLocator.boundingBox();
await refLocator.click({ position: { x: refBox.width - 4, y: refBox.height / 2 } });
// 누른 직후 곧바로 키를 보내면 에디터가 새 커서 자리를 읽기 전이라 잠깐 기다린다.
await sleep(150);
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("/그림 번호");
await page.getByRole("option", { name: /그림 번호/ }).waitFor();
await page.keyboard.press("Enter");
await page.keyboard.type("새 그림");
await page.keyboard.press("End");
await sleep(150);
await page.keyboard.press("Enter");
await page.keyboard.type("앞의 [[#");
await sleep(300);
await page.screenshot({ path: path.join(OUT, "xref-suggest.png") });
await page.getByRole("option", { name: /그림 1 · 새 그림/ }).waitFor();
await page.keyboard.press("Enter");
await sleep(1200);
const saved = fs.readFileSync(file, "utf8");
assert(saved.includes("새 그림 ^fig-1"), `/그림 번호로 아직 안 쓴 ID(fig-1)의 캡션을 만든다 (${saved.match(/새 그림[^\n]*/)?.[0]})`);
const newId = /새 그림 \^(fig-\d+)/.exec(saved)?.[1];
assert(saved.includes(`앞의 [[#^${newId}]]`), "[[# 자동완성으로 그림 참조를 넣는다");
const after = await captionLabels();
assert(after[0]?.trim() === "그림 1." && after[1]?.trim() === "그림 2.", "앞에 새 그림이 생기면 뒤 그림 번호가 밀린다");
const refsAfter = await page.locator(".note-prose .wikilink.xref").evaluateAll((els) => els.map((el) => getComputedStyle(el, "::before").content));
assert(refsAfter.includes('"그림 3"'), `기존 참조도 새 번호를 따라간다 (${refsAfter})`);

// ── 내보내기 번호 ──
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hw-xref-")), "out.html");
await app.evaluate(({ dialog }, f) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
}, out);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "웹 문서" }).click();
for (let i = 0; i < 30 && !fs.existsSync(out); i++) await sleep(200);
const html = fs.readFileSync(out, "utf8");
assert(html.includes('class="xref">그림 3</a>') && html.includes('<strong class="caption-label">표 1. </strong>점수'), "HTML로 내보내도 번호가 그대로 나온다");
assert(!/\^fig-|\^tbl-/.test(html.replace(/href="#[^"]*"|id="[^"]*"/g, "")), "내보낸 글에는 ^id 표시가 남지 않는다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
