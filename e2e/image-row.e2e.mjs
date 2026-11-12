// 이미지 나란히 놓기(묶음)와 묶음 라벨을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:image-row`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const png = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "photo.png"));
const picks = fs.mkdtempSync(path.join(os.tmpdir(), "hw-picks-"));
const pickFiles = ["풍경1.png", "풍경2.png", "풍경3.png", "풍경4.png"].map((name) => {
  const file = path.join(picks, name);
  fs.writeFileSync(file, png);
  return file;
});

const env = await launchApp({ open: "사진글", files: { "사진글.md": "# 사진글\n\n앞 글입니다.\n\n뒷 글입니다.\n" } });
const { app, page, ws, logs } = env;
const note = () => fs.readFileSync(path.join(ws, "사진글.md"), "utf8");
const waitNote = async (test) => {
  for (let i = 0; i < 40; i++) {
    if (test(note())) return true;
    await sleep(250);
  }
  return false;
};

// 명령 팔레트(Ctrl+Shift+P)는 ">"가 미리 들어 있는 채로 열린다.
async function palette(title) {
  await page.keyboard.press("Control+Shift+P");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "검색어" && document.activeElement.value === ">");
  await page.keyboard.type(title);
  await page.waitForFunction((text) => document.activeElement?.value === `>${text}`, title);
  await sleep(300);
  await page.keyboard.press("Enter");
  await sleep(600);
}

// 파일을 한꺼번에 여러 장 고른다.
await app.evaluate(({ dialog }, files) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
}, pickFiles.slice(0, 3));
await palette("첨부 패널 열기");
await page.locator(".note-prose p", { hasText: "앞 글입니다." }).click();
await page.getByRole("button", { name: "첨부 추가" }).click();
await page.locator(".note-prose p.image-row").waitFor();

const row = page.locator(".note-prose p.image-row");
assert((await row.locator("img.embed-media").count()) === 3, "여러 이미지를 한꺼번에 첨부하면 한 묶음이 된다");
const boxes = await row.locator("img.embed-media").evaluateAll((imgs) => imgs.map((img) => img.getBoundingClientRect()).map((r) => ({ x: r.x, y: Math.round(r.y), w: r.width })));
assert(boxes.every((b) => b.y === boxes[0].y) && boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x, "이미지가 한 줄에 나란히 놓인다");
assert(Math.abs(boxes[0].w - boxes[1].w) < 2 && Math.abs(boxes[1].w - boxes[2].w) < 2, "칸 너비가 같다");

// 라벨 캡션이 아래에 생기고 커서가 거기에 있어서 바로 쓸 수 있다.
const caption = page.locator(".note-prose p.caption").first();
await caption.waitFor();
assert(/^그림 1\./.test((await caption.getAttribute("data-caption")) ?? "") || (await caption.getAttribute("data-caption")) === "그림 1.", "묶음 아래에 '그림 1.' 라벨 줄이 생긴다");
await page.keyboard.type("제주 풍경 세 장");
assert(await waitNote((t) => t.includes("![[풍경1.png]] ![[풍경2.png]] ![[풍경3.png]]") && t.includes("제주 풍경 세 장 ^fig-1")), "파일에는 한 줄의 임베드와 `^fig-1` 라벨이 남는다");
await page.screenshot({ path: path.join(OUT, "image-row.png") });

// 풀기 / 다시 나란히
await row.locator("img.embed-media").first().click();
await palette("나란히 놓은 이미지 풀기");
assert((await page.locator(".note-prose p.image-row").count()) === 0 && (await page.locator(".note-prose img.embed-media").count()) === 3, "나란히 놓은 이미지를 풀면 위아래로 놓인다");
assert(await waitNote((t) => t.includes("![[풍경1.png]]\n\n![[풍경2.png]]\n\n![[풍경3.png]]")), "풀면 문단 하나씩이 된다");

await page.locator(".note-prose img.embed-media").nth(1).click();
await palette("이미지 나란히 놓기");
assert((await page.locator(".note-prose p.image-row img.embed-media").count()) === 3, "이어진 이미지를 다시 나란히 놓는다");
assert((note().match(/\^fig-/g) ?? []).length === 1, "이미 있는 라벨이 있으면 라벨 줄을 더 만들지 않는다");

// 이미 이미지가 있는 줄에 이미지를 하나 더 올리면 그 옆에 나란히 놓인다.
await app.evaluate(({ dialog }, files) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
}, [pickFiles[3]]);
await row.locator("img.embed-media").nth(1).click();
await page.getByRole("button", { name: "첨부 추가" }).click();
await page.waitForFunction(() => document.querySelectorAll(".note-prose p.image-row img.embed-media").length === 4, null, { timeout: 8000 });
const grid = await page.locator(".note-prose p.image-row").evaluate((el) => ({ cols: getComputedStyle(el).gridTemplateColumns.split(" ").length, label: document.querySelectorAll(".note-prose p.caption").length }));
assert(grid.cols === 2 && grid.label === 1, "이미지가 있는 줄에 하나 더 올리면 나란히 놓이고(4장은 2×2) 라벨 줄은 그대로 하나다");
assert(await waitNote((t) => t.includes("![[풍경1.png]] ![[풍경2.png]] ![[풍경3.png]] ![[풍경4.png]]")), "파일에도 한 줄로 이어 붙는다");

// 묶음을 우클릭하면 그룹 해제가 뜬다.
await row.locator("img.embed-media").first().click({ button: "right" });
const menu = page.getByRole("menu", { name: "이미지 묶음 메뉴" });
await menu.waitFor();
assert((await menu.getByRole("menuitem").allTextContents()).join().includes("그룹 해제"), "묶음을 우클릭하면 '그룹 해제'가 뜬다");
await page.screenshot({ path: path.join(OUT, "image-row-menu.png") });
await menu.getByRole("menuitem", { name: "그룹 해제" }).click();
assert((await page.locator(".note-prose p.image-row").count()) === 0 && (await page.locator(".note-prose img.embed-media").count()) === 4, "그룹 해제하면 이미지가 위아래로 풀린다");
// 글 문단을 우클릭하면 메뉴가 뜨지 않는다.
await page.locator(".note-prose p", { hasText: "앞 글입니다." }).click({ button: "right" });
await sleep(300);
assert((await page.getByRole("menu", { name: "이미지 묶음 메뉴" }).count()) === 0, "묶음이 아닌 곳에서는 메뉴가 뜨지 않는다");
await page.keyboard.press("Escape");
await page.locator(".note-prose img.embed-media").nth(2).click();
await palette("이미지 나란히 놓기");
assert((await page.locator(".note-prose p.image-row img.embed-media").count()) === 4, "풀었던 이미지를 다시 묶는다");

// 내보내기에도 묶음과 라벨이 나온다.
const out = path.join(ws, "..", `hw-row-${Date.now()}.html`);
await app.evaluate(({ dialog }, file) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
}, out);
await page.getByRole("button", { name: "내보내기", exact: true }).click();
await page.getByRole("menuitem", { name: "웹 문서" }).click();
for (let i = 0; i < 40 && !fs.existsSync(out); i++) await sleep(200);
await sleep(300);
const html = fs.readFileSync(out, "utf8");
assert(/<p class="image-row" style="--cols:2;">(<img[^>]*> ?){4}<\/p>/.test(html), "내보낸 HTML에도 나란히 놓인 묶음이 나온다");
assert(html.includes("그림 1. </strong>제주 풍경 세 장") || /그림 1\.\s*<\/strong>\s*제주 풍경 세 장/.test(html), "묶음 라벨이 '그림 1. 제주 풍경 세 장'으로 나온다");

// 묶음 안의 그림 하나를 눌러도 묶음 전체가 골라지고, 서식 막대 대신 묶음 막대가 뜬다
await page.locator(".note-prose p.image-row img.embed-media").nth(1).click();
await sleep(400);
const rowBar = page.getByRole("toolbar", { name: "나란히 놓은 그림" });
assert((await page.locator(".note-prose p.image-row.ProseMirror-selectednode").count()) === 1, "그림 하나를 눌러도 묶음 전체가 골라진다");
assert((await rowBar.isVisible()) && (await rowBar.innerText()).includes("그림 4장 나란히"), "묶음 위에 몇 장인지와 풀기·캡션 버튼이 있는 막대가 뜬다");
assert(!(await page.getByRole("button", { name: "굵게" }).isVisible()) && (await page.getByRole("button", { name: "퇴고하기" }).count()) === 0, "그림 묶음에는 글자 서식·수정·퇴고 막대가 뜨지 않는다");
assert(await rowBar.getByRole("button", { name: "라벨로 캡션 채우기" }).isDisabled(), "그림에 라벨이 없으면 캡션 채우기는 꺼져 있다");
await page.screenshot({ path: path.join(OUT, "image-row-bar.png") });

// 그림마다 라벨을 달면 캡션을 `전 | 후`처럼 이어서 채우고, 그림 밑의 라벨은 숨긴다
await page.keyboard.press("Escape");
await page.locator(".note-prose p", { hasText: "앞 글입니다." }).click();
await sleep(1500);
fs.writeFileSync(path.join(ws, "사진글.md"), note().replace("![[풍경1.png]]", "![[풍경1.png|수정 전]]").replace("![[풍경2.png]]", "![[풍경2.png|수정 후]]"));
await page.waitForFunction(() => [...document.querySelectorAll(".note-prose .embed-caption")].some((el) => el.textContent === "수정 전"), null, { timeout: 8000 });
await page.locator(".note-prose p.image-row img.embed-media").first().click();
await sleep(300);
await rowBar.getByRole("button", { name: "라벨로 캡션 채우기" }).click();
assert(await waitNote((t) => t.includes("수정 전 | 수정 후 ^fig-1")), "캡션이 그림 라벨을 이은 `수정 전 | 수정 후`로 바뀌고 ^fig-1 표시는 그대로다");
const labelShown = await page.locator(".note-prose p.image-row .embed-caption").first().evaluate((el) => getComputedStyle(el).display);
assert(labelShown === "none", "캡션에 라벨이 모두 들어가면 그림 밑의 라벨은 숨긴다");
await page.screenshot({ path: path.join(OUT, "image-row-labels.png") });
await page.locator(".note-prose p.image-row img.embed-media").first().click();
await sleep(300);
await rowBar.getByRole("button", { name: "나란히 풀기" }).click();
assert((await page.locator(".note-prose p.image-row").count()) === 0 && (await rowBar.count()) === 0, "막대의 나란히 풀기로 묶음을 푼다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
