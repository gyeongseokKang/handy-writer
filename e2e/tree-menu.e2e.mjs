// 글 목록의 우클릭 메뉴(새 폴더, 이름 바꾸기, 옮기기, 복제, 삭제)를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:tree-menu`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({
  open: "README",
  files: {
    "글쓰기/README.md": "# 리드미 본문\n",
    "메모.md": "메모 본문\n",
    "데일리/2025.md": "일기\n",
  },
});
const { app, page, ws, logs, composingEnter } = env;
page.on("dialog", (dialog) => void dialog.accept());

const tree = page.locator("nav[aria-label='글 목록']");
const menu = page.getByRole("menu");
const exists = (rel) => fs.existsSync(path.join(ws, rel));
const row = (name) => tree.locator("button", { hasText: new RegExp(`^${name}$`) }).first();
const editorHas = (text) => page.waitForFunction((t) => document.querySelector(".note-prose")?.textContent?.includes(t), text);

await editorHas("리드미 본문");

// 빈 곳 우클릭 → 새 폴더 → 바로 이름 입력
const box = await tree.boundingBox();
await page.mouse.click(box.x + 60, box.y + box.height + 80, { button: "right" });
await menu.waitFor();
assert((await menu.getAttribute("aria-label")) === "글 목록 메뉴", "빈 곳을 우클릭하면 목록 메뉴가 뜬다");
assert(JSON.stringify(await menu.getByRole("menuitem").allInnerTexts()) === JSON.stringify(["새 글", "새 폴더"]), "목록 메뉴에는 새 글과 새 폴더가 있다");
await page.screenshot({ path: path.join(OUT, "tree-menu-root.png") });
await menu.getByRole("menuitem", { name: "새 폴더" }).click();
const folderInput = page.getByLabel("새 폴더 폴더 새 이름");
await folderInput.waitFor();
await folderInput.fill("자료");
await folderInput.press("Enter");
await row("자료").waitFor();
assert(exists("자료") && fs.readdirSync(path.join(ws, "자료")).length === 0, "새 폴더가 디스크에 생기고, 비어 있어도 목록에 보인다");
assert(await tree.getByText("비어 있음").isVisible(), "빈 폴더를 펼치면 비어 있다고 보여준다");

// 키보드로 메뉴 다루기
await row("메모").click({ button: "right" });
await menu.waitFor();
assert((await menu.getAttribute("aria-label")) === "글 메뉴", "글을 우클릭하면 글 메뉴가 뜬다");
assert((await page.evaluate(() => document.activeElement?.textContent)) === "이름 바꾸기", "메뉴를 열면 첫 항목에 포커스가 간다");
await page.keyboard.press("ArrowDown");
assert((await page.evaluate(() => document.activeElement?.textContent)) === "복제", "화살표로 항목을 옮겨 다닌다");
await page.screenshot({ path: path.join(OUT, "tree-menu-note.png") });
await page.keyboard.press("Escape");
assert((await menu.count()) === 0, "Esc로 메뉴를 닫는다");

// 링크 복사
await row("메모").click({ button: "right" });
await menu.getByRole("menuitem", { name: "링크 복사" }).click();
await sleep(200);
assert((await app.evaluate(({ clipboard }) => clipboard.readText())) === "[[메모]]", "링크 복사는 [[이름]]을 복사한다");

// 열어 둔 글이 든 폴더의 이름 바꾸기 → 열린 글이 따라간다
await row("글쓰기").click({ button: "right" });
assert((await menu.getAttribute("aria-label")) === "폴더 메뉴", "폴더를 우클릭하면 폴더 메뉴가 뜬다");
await menu.getByRole("menuitem", { name: "이름 바꾸기" }).click();
const renameFolder = page.getByLabel("글쓰기 폴더 새 이름");
await renameFolder.fill("원고");
await renameFolder.press("Enter");
await row("원고").waitFor();
assert(exists("원고/README.md") && !exists("글쓰기"), "폴더 이름을 바꾸면 안의 글도 함께 옮겨진다");
await sleep(400);
assert((await page.locator(".note-prose").innerText()).includes("리드미 본문"), "열어 둔 글이 새 폴더 경로로 계속 열려 있다");

// 다른 폴더로 옮기기 (찾기 + Enter)
await row("README").click({ button: "right" });
await menu.getByRole("menuitem", { name: "다른 폴더로 옮기기…" }).click();
const picker = page.getByRole("dialog", { name: "옮길 폴더 고르기" });
await picker.waitFor();
const options = await picker.getByRole("option").allInnerTexts();
assert(options.includes("맨 위") && options.includes("자료") && !options.includes("원고"), `지금 폴더를 뺀 폴더와 맨 위가 보인다 (${options.join(", ")})`);
await page.screenshot({ path: path.join(OUT, "tree-menu-move.png") });
await picker.getByLabel("폴더 찾기").fill("자료");
await page.keyboard.press("Enter");
await sleep(500);
assert(exists("자료/README.md") && !exists("원고/README.md"), "고른 폴더로 글이 옮겨진다");
await page.click(".note-prose h1");
await page.keyboard.press("End");
await page.keyboard.type(" 끝에 덧붙임");
await sleep(1200);
assert(fs.readFileSync(path.join(ws, "자료", "README.md"), "utf8").includes("끝에 덧붙임"), "옮긴 뒤에도 열린 글을 고치면 새 위치에 저장된다");

// 복제 → 사본이 열린다
await row("메모").click({ button: "right" });
await menu.getByRole("menuitem", { name: "복제" }).click();
await editorHas("메모 본문");
await row("메모 1").waitFor();
assert(exists("메모 1.md") && fs.readFileSync(path.join(ws, "메모 1.md"), "utf8") === "메모 본문\n", "복제하면 번호를 붙인 사본이 생긴다");

// 글 이름 바꾸기: 한글 조합 중 Enter는 저장하지 않고, Esc는 취소
await row("메모 1").click({ button: "right" });
await menu.getByRole("menuitem", { name: "이름 바꾸기" }).click();
const renameNote = page.getByLabel("메모 1 새 이름");
await renameNote.fill("메모 사본");
await composingEnter("input[aria-label='메모 1 새 이름']");
assert(await renameNote.isVisible(), "한글 조합 중 Enter로는 이름을 바꾸지 않는다");
await renameNote.press("Escape");
assert(exists("메모 1.md") && (await renameNote.count()) === 0, "Esc를 누르면 이름을 바꾸지 않는다");

await row("메모 1").click({ button: "right" });
await menu.getByRole("menuitem", { name: "이름 바꾸기" }).click();
await page.getByLabel("메모 1 새 이름").fill("메모 사본");
await page.getByLabel("메모 1 새 이름").press("Enter");
await row("메모 사본").waitFor();
assert(exists("메모 사본.md") && !exists("메모 1.md"), "Enter로 글 이름을 바꾼다");

// 폴더를 휴지통으로
await row("데일리").click({ button: "right" });
await menu.getByRole("menuitem", { name: "휴지통으로 이동" }).click();
await sleep(800);
assert(!exists("데일리") && (await row("데일리").count()) === 0, "폴더를 안의 글과 함께 휴지통으로 옮긴다");
ok("우클릭 메뉴 확인");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
