// 원문 보존, 저장 실패 재시도와 닫기 확인, 바깥 변경 충돌, 문장 다듬기 설정을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:keep-safe`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const ORIGINAL = [
  "# 원문",
  "",
  "주소는 https://example.com 이에요.",
  "",
  "| 이름 | 점수 |",
  "|---|---|",
  "| 가 | 1 |",
  "",
  "* 별표 목록",
  "* 둘째",
  "",
  "고칠 문단.",
  "",
].join("\n");
const env = await launchApp({ open: "원문", files: { "원문.md": ORIGINAL } });
const { app, page, ws, logs } = env;
const file = path.join(ws, "원문.md");
const read = () => fs.readFileSync(file, "utf8");
const status = page.locator("footer [role='status']").first();
const typeAtEnd = async (text) => {
  await page.locator(".note-prose p", { hasText: "고칠 문단" }).click();
  await sleep(150);
  await page.keyboard.press("End");
  await sleep(100);
  await page.keyboard.type(text);
};

// ── 1. 원문 보존 ──
await typeAtEnd(" 고침");
await sleep(1200);
assert(read() === ORIGINAL.replace("고칠 문단.", "고칠 문단. 고침"), `한 문단만 고치면 표 간격·주소·목록 기호는 원문 그대로다\n${read()}`);

// ── 2. 바깥 변경 충돌 ──
await typeAtEnd(" 내 것");
const theirs = ORIGINAL.replace("고칠 문단.", "바깥에서 고친 문단.");
fs.writeFileSync(file, theirs);
const bar = page.getByRole("alert").filter({ hasText: "다른 곳" });
await bar.waitFor({ timeout: 5000 });
await sleep(1200);
assert(read() === theirs, "저장하지 않은 내 변경이 있으면 바깥 변경을 덮어쓰지 않는다");
assert((await status.innerText()).includes("충돌"), "상태에 충돌이 보인다");
await bar.getByRole("button", { name: "차이 보기" }).click();
const diff = page.getByRole("dialog", { name: "바깥 변경과 내 변경의 차이" });
await diff.waitFor();
assert((await diff.locator("del").allInnerTexts()).join("").includes("바깥에서") && (await diff.locator("ins").allInnerTexts()).join("").includes("내 것"), "차이 보기에 바깥 내용(빨강)과 내 변경(초록)이 보인다");
await page.screenshot({ path: path.join(OUT, "conflict.png") });
await diff.getByRole("button", { name: "내 것으로 덮어쓰기" }).click();
await sleep(1000);
assert(read().includes("고칠 문단. 고침 내 것") && !read().includes("바깥에서"), "내 것으로 덮어쓰기");
assert((await bar.count()) === 0, "고르면 충돌 막대가 사라진다");

await typeAtEnd(" 또");
fs.writeFileSync(file, theirs);
await bar.waitFor({ timeout: 5000 });
await bar.getByRole("button", { name: "바깥 내용 불러오기" }).click();
await sleep(1000);
assert((await page.locator(".note-prose").innerText()).includes("바깥에서 고친 문단.") && read() === theirs, "바깥 내용 불러오기");

// ── 3. 저장 실패 재시도와 닫기 확인 ──
await app.evaluate(({ ipcMain }, root) => {
  const fs = process.mainModule.require("node:fs");
  const p = process.mainModule.require("node:path");
  globalThis.__failWrites = true;
  ipcMain.removeHandler("notes:write");
  ipcMain.handle("notes:write", (_e, rel, content) => {
    if (globalThis.__failWrites) throw new Error("디스크가 가득 찼어요");
    fs.writeFileSync(p.join(root, rel), content);
  });
}, ws);
await page.locator(".note-prose p", { hasText: "바깥에서" }).click();
await sleep(150);
await page.keyboard.press("End");
await page.keyboard.type(" 실패");
await sleep(1500);
assert((await status.innerText()).includes("저장 실패"), `저장에 실패하면 상태에 보인다 (${await status.innerText()})`);

// 닫으려 하면 묻고, 취소하면 창이 남는다.
await app.evaluate(({ dialog, BrowserWindow }) => {
  globalThis.__asked = [];
  dialog.showMessageBox = async (_win, options) => {
    globalThis.__asked.push(options.detail);
    return { response: 0 };
  };
  BrowserWindow.getAllWindows()[0].close();
});
await sleep(1500);
const asked = await app.evaluate(() => globalThis.__asked);
assert(asked.length === 1 && asked[0].includes("원문"), `저장하지 못한 글이 있으면 닫기 전에 묻는다 (${asked})`);
assert((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1, "취소하면 창이 닫히지 않는다");

await app.evaluate(() => {
  globalThis.__failWrites = false;
});
await sleep(4500);
assert(read().includes("바깥에서 고친 문단. 실패") && (await status.innerText()) === "저장됨", `디스크가 돌아오면 저절로 다시 저장한다 (${await status.innerText()})`);

// ── 4. 문장 다듬기 설정과 내 표기 사전 ──
await page.locator(".note-prose p", { hasText: "바깥에서" }).click();
await sleep(150);
await page.keyboard.press("End");
await page.keyboard.type(" 미리 예약한 컨텐츠.");
await page.keyboard.press("ArrowUp");
await sleep(500);
assert((await page.locator(".note-prose [data-spell='style:미리 예약']").count()) === 1, "기본으로 겹말을 알린다");
await page.getByRole("button", { name: "맞춤법 설정" }).click();
await page.getByRole("button", { name: /다듬기 설정/ }).click();
const settings = page.getByRole("dialog", { name: "문장 다듬기 설정" });
await settings.getByLabel(/겹말/).uncheck();
await settings.getByLabel("긴 문장 기준 글자 수").fill("20");
const dict = settings.getByLabel("내 표기 사전 내용");
await dict.fill(`${await dict.inputValue()}컨텐츠 -> 콘텐츠 # 외래어 표기법\n`);
await page.screenshot({ path: path.join(OUT, "style-settings.png") });
await settings.getByRole("button", { name: "저장" }).click();
await sleep(600);
const dictFile = path.join(ws, ".handy-writer", "style.md");
assert(fs.existsSync(dictFile) && fs.readFileSync(dictFile, "utf8").includes("컨텐츠 -> 콘텐츠"), "내 표기 사전은 작업 폴더의 .handy-writer/style.md에 저장된다");
assert((await page.locator(".note-prose [data-spell='style:미리 예약']").count()) === 0, "끈 규칙은 알리지 않는다");
assert((await page.locator(".note-prose [data-spell='style:custom:컨텐츠']").count()) === 1, "내 표기 사전의 표현을 알린다");
assert((await page.locator(".note-prose .style-long").count()) > 0, "긴 문장 기준을 줄이면 더 짧은 문장도 알린다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
