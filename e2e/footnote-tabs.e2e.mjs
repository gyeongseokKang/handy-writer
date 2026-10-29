// 각주, 탭, 분할 화면을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:footnote-tabs`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const files = {
  "각주.md": "# 각주 시험\n\n본문 문장[^1] 그리고 이름 붙은 각주[^출처].\n\n[^1]: 첫 각주 내용\n\n[^출처]: 이름 붙은 내용\n",
  "자료.md": "# 자료\n\n옆에 띄워 볼 참고 글.\n",
  "셋째.md": "# 셋째\n\n세 번째 글.\n",
};
const env = await launchApp({ open: "각주", files });
const { app, page, ws, logs } = env;
const read = (name) => fs.readFileSync(path.join(ws, name), "utf8");
const tree = page.getByRole("navigation", { name: "글 목록" });
const tabs = page.getByRole("tablist", { name: "열린 글" });
const tabNames = async () => (await tabs.getByRole("tab").allInnerTexts()).map((t) => t.trim());
const activeTab = async () => (await tabs.getByRole("tab", { selected: true }).innerText()).trim();

// ── 각주 ──
const sups = page.locator(".note-prose sup.footnote-ref");
assert((await sups.count()) === 2, "본문의 각주 표시 2개를 읽는다");
assert(JSON.stringify(await sups.evaluateAll((els) => els.map((el) => el.getAttribute("data-number")))) === '["1","2"]', "나온 순서대로 1, 2 번호를 매긴다 (이름 붙은 각주도)");
assert((await sups.first().getAttribute("title")) === "첫 각주 내용", "각주 표시에 올리면 내용이 보인다");
assert((await page.locator(".note-prose .footnote-def").count()) === 2, "내용 줄 2개가 글 끝에 보인다");
await page.screenshot({ path: path.join(OUT, "footnotes.png") });

await sups.nth(1).click();
await sleep(400);
const caretText = await page.evaluate(() => window.getSelection()?.anchorNode?.textContent ?? "");
assert(caretText.includes("이름 붙은 내용"), `각주 표시를 누르면 내용 줄로 간다 (${caretText})`);

await page.locator(".note-prose p").first().click();
await page.keyboard.press("End");
await page.keyboard.type(" 덧붙임 /각주");
await page.getByRole("option", { name: /각주/ }).first().waitFor();
await page.keyboard.press("Enter");
await page.keyboard.type("새로 넣은 각주");
await sleep(1200);
const saved = read("각주.md");
assert(saved.includes("덧붙임[^2]") || saved.includes("덧붙임 [^2]"), "/각주로 다음 번호의 각주 표시를 넣는다");
assert(saved.trimEnd().endsWith("[^2]: 새로 넣은 각주"), `글 끝에 내용 줄을 만들고 커서를 옮긴다 (${JSON.stringify(saved.slice(-40))})`);
assert(saved.includes("[^1]: 첫 각주 내용") && saved.includes("[^출처]: 이름 붙은 내용"), "기존 각주는 그대로 저장된다");

// ── 탭 ──
assert(JSON.stringify(await tabNames()) === '["각주"]', "연 글이 탭으로 보인다");
await tree.getByText("자료", { exact: true }).click();
await sleep(300);
assert(JSON.stringify(await tabNames()) === '["자료"]', "그냥 누르면 지금 탭을 바꾼다");
await tree.getByText("각주", { exact: true }).click({ modifiers: ["Control"] });
await tree.getByText("셋째", { exact: true }).click({ modifiers: ["Control"] });
await sleep(300);
assert(JSON.stringify(await tabNames()) === '["자료","각주","셋째"]' && (await activeTab()) === "셋째", `Ctrl+클릭은 새 탭으로 연다 (${await tabNames()})`);
await page.keyboard.press("Control+1");
await sleep(200);
assert((await activeTab()) === "자료", "Ctrl+1은 첫 탭");
await page.keyboard.press("Control+Tab");
await sleep(200);
assert((await activeTab()) === "각주", "Ctrl+Tab은 다음 탭");
await page.keyboard.press("Control+Shift+Tab");
await page.keyboard.press("Control+Shift+Tab");
await sleep(200);
assert((await activeTab()) === "셋째", "Ctrl+Shift+Tab은 이전 탭 (처음에서 끝으로)");
await page.locator(".note-prose").click();
// Playwright의 키 입력(CDP)은 before-input-event를 거치지 않으므로 실제 키보드처럼 창에 입력을 보낸다.
await app.evaluate(({ BrowserWindow }) => {
  const wc = BrowserWindow.getAllWindows()[0].webContents;
  wc.sendInputEvent({ type: "keyDown", keyCode: "W", modifiers: ["control"] });
  wc.sendInputEvent({ type: "keyUp", keyCode: "W", modifiers: ["control"] });
});
await sleep(400);
assert(JSON.stringify(await tabNames()) === '["자료","각주"]' && (await activeTab()) === "각주", `Ctrl+W는 창이 아니라 지금 탭을 닫고 옆 탭을 연다 (${await tabNames()})`);
await tabs.getByRole("button", { name: "자료 탭 닫기" }).click();
await sleep(300);
assert(JSON.stringify(await tabNames()) === '["각주"]', "X로 탭을 닫는다");
await tree.getByText("자료", { exact: true }).click({ modifiers: ["Control"] });
const title = page.getByLabel("글 제목").first();
await title.fill("자료 모음");
await title.press("Enter");
await sleep(800);
assert((await tabNames()).includes("자료 모음"), "탭의 글 이름을 바꾸면 탭도 따라간다");

// ── 분할 화면 ──
await tree.getByText("셋째", { exact: true }).click({ modifiers: ["Alt"] });
const side = page.getByRole("region", { name: /^옆에 연 글/ });
await side.waitFor();
assert((await side.locator(".note-prose").innerText()).includes("세 번째 글"), "Alt+클릭으로 오른쪽에 나란히 띄운다");
assert((await page.locator(".note-prose").count()) === 2, "에디터가 둘 보인다");
await side.locator(".note-prose p").first().click();
await page.keyboard.press("End");
await page.keyboard.type(" 옆에서 고침");
await sleep(1200);
assert(read("셋째.md").includes("세 번째 글. 옆에서 고침"), "옆 에디터에서 고친 내용도 저장된다");
await page.keyboard.press("Control+f");
await sleep(300);
assert((await side.getByRole("search").count()) === 1 && (await page.getByRole("search").count()) === 1, "Ctrl+F는 마지막으로 만진 쪽 에디터에서만 열린다");
await page.keyboard.press("Escape");
await page.screenshot({ path: path.join(OUT, "split.png") });

await side.getByRole("button", { name: "자리 바꾸기" }).click();
await sleep(500);
assert((await activeTab()) === "셋째" && (await side.getAttribute("aria-label")).includes("자료 모음"), "자리 바꾸기로 가운데와 오른쪽 글을 맞바꾼다");
await tree.getByText("자료 모음", { exact: true }).click();
await sleep(500);
assert((await activeTab()) === "자료 모음" && (await side.getAttribute("aria-label")).includes("셋째"), "오른쪽 글을 가운데에서 열면 서로 자리를 바꾼다");
await page.keyboard.press("Control+\\");
await sleep(300);
assert((await side.count()) === 0, "Ctrl+\\로 분할 화면을 닫는다");
await page.keyboard.press("Control+\\");
await sleep(300);
assert((await side.count()) === 1, "Ctrl+\\로 옆 탭을 다시 띄운다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
