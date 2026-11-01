// 도움말과 README에 쓰는 화면 그림을 만든다. 가상의 제주 여행 원고가 든 작업 폴더(git 기록, 원격 저장소 포함)로
// 앱을 띄워 장면마다 조작해서 찍고, webp로 줄여 `src/renderer/src/shared/assets/help/`에 저장한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm docs:screenshots [그림 이름…]`
//   SHOT_PNG_DIR=폴더 를 주면 확인용 png도 함께 저장한다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { launchApp, sleep } from "../e2e/helpers.mjs";
import { FILES, HYEOPJAE, MANUSCRIPTS } from "./demo-content.mjs";

const OUT = path.resolve(import.meta.dirname, "../src/renderer/src/shared/assets/help");
fs.mkdirSync(OUT, { recursive: true });
const PNG_DIR = process.env.SHOT_PNG_DIR;
if (PNG_DIR) fs.mkdirSync(PNG_DIR, { recursive: true });
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);

/** 화면 그림 폭의 상한(px)과 webp 품질. 글자가 또렷하면서 한 장이 100KB 안팎이 되게 한다. */
const MAX_WIDTH = 960;
const WEBP_QUALITY = 0.82;

const remote = fs.mkdtempSync(path.join(os.tmpdir(), "hw-demo-remote-"));
const git = (cwd, args, date) =>
  execFileSync("git", ["-c", "user.name=한결", "-c", "user.email=hangyeol@example.com", ...args], {
    cwd,
    env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
    stdio: "ignore",
  });

/** 작업 폴더에 글과 git 기록(협재의 바다가 네 번 고쳐진 기록), 원격 저장소를 만든다. */
function setup(ws) {
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    fs.writeFileSync(path.join(ws, rel), text);
  };
  fs.mkdirSync(path.join(ws, "attachments"), { recursive: true });
  fs.copyFileSync(path.join(import.meta.dirname, "demo", "hyeopjae.png"), path.join(ws, "attachments", "협재.png"));
  git(remote, ["init", "-q", "--bare", "-b", "main"]);
  git(ws, ["init", "-q", "-b", "main"]);
  for (const [rel, text] of Object.entries(FILES)) write(rel, text);
  write(".handy-writer/manuscripts.json", `${JSON.stringify(MANUSCRIPTS, null, 2)}\n`);
  git(ws, ["add", "-A"]);
  git(ws, ["commit", "-q", "-m", "제주 여행기 원고 시작"], "2026-10-10T20:00:00");
  for (const version of HYEOPJAE.versions) {
    write(HYEOPJAE.path, version.text);
    git(ws, ["add", "-A"]);
    git(ws, ["commit", "-q", "-m", version.message], version.date);
  }
  git(ws, ["remote", "add", "origin", remote]);
  git(ws, ["push", "-q", "-u", "origin", "main"]);
}

const env = await launchApp({ setup });
const { page, ws } = env;
const tree = page.locator("nav[aria-label='글 목록']");
const failed = [];

/** png → webp (앱 화면의 canvas로 줄여서 따로 도구를 설치하지 않아도 된다) */
async function toWebp(png) {
  const b64 = await page.evaluate(
    async ({ data, maxWidth, quality }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const scale = Math.min(1, maxWidth / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      const out = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      for (let i = 0; i < out.length; i += 0x8000) text += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return { data: btoa(text), width: canvas.width, height: canvas.height };
    },
    { data: png.toString("base64"), maxWidth: MAX_WIDTH, quality: WEBP_QUALITY },
  );
  return { webp: Buffer.from(b64.data, "base64"), width: b64.width, height: b64.height };
}

/** 그림 크기(px). 도움말이 그림을 불러오기 전에 자리를 잡아 두어 스크롤 위치가 밀리지 않게 한다. */
const SIZES_FILE = path.join(OUT, "sizes.json");
function rememberSize(name, width, height) {
  let sizes = {};
  try {
    sizes = JSON.parse(fs.readFileSync(SIZES_FILE, "utf8"));
  } catch {
    // 처음이면 새로 만든다.
  }
  sizes[name] = [width, height];
  const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(SIZES_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** name 그림을 저장한다. clip을 주면 그 영역만, 없으면 창 전체 */
async function shot(name, clip) {
  if (!want(name)) return;
  const png = await page.screenshot(clip ? { clip } : {});
  if (PNG_DIR) fs.writeFileSync(path.join(PNG_DIR, `${name}.png`), png);
  const { webp, width, height } = await toWebp(png);
  fs.writeFileSync(path.join(OUT, `${name}.webp`), webp);
  rememberSize(name, width, height);
  console.log(`shot: ${name} (${Math.round(webp.length / 1024)}KB, ${width}x${height})`);
}

/** 여러 요소를 모두 담는 영역(여백 pad)을 화면 안으로 맞춰서 돌려준다. */
async function around(locators, pad = 16) {
  const boxes = [];
  for (const locator of locators) {
    const box = await locator.first().boundingBox();
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) throw new Error("영역을 찾지 못했어요");
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(1280, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(820, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** 장면 하나. 실패해도 다음 장면은 계속한다. */
async function scene(label, run) {
  try {
    await run();
  } catch (error) {
    failed.push(label);
    console.log(`FAIL scene: ${label}: ${String(error.message).split("\n").slice(0, 3).join(" | ")}`);
    // 열려 있을 수 있는 창을 닫고 다음으로 간다.
    await page.keyboard.press("Escape").catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(300);
  }
}

/** 글 목록의 버튼. git으로 바뀐 글은 접근성 이름 끝에 ‘ git 변경됨’이 붙으므로 그것까지 받아 준다. */
const treeButton = (name) => tree.getByRole("button", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( git 변경됨)?$`) });
const open = async (name, modifiers = []) => {
  await treeButton(name).click({ modifiers });
  await page.waitForSelector(".note-prose");
  await sleep(600);
};
const tab = (name) => page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name });
const scrollTo = (top) => page.evaluate((y) => document.querySelector("[data-note-scroller]").scrollTo(0, y), top);
const palette = async (query) => {
  await page.keyboard.press("Control+Shift+P");
  await page.getByLabel("검색어").waitFor();
  if (query) await page.getByLabel("검색어").fill(`>${query}`);
  await sleep(400);
};

// 온라인 맞춤법 검사는 끄고(오프라인에서도 같은 화면), 즐겨찾기를 미리 넣어 둔다.
await page.evaluate(
  ([root, favorites]) => {
    localStorage.setItem("handy-writer:spellcheck-online", "false");
    localStorage.setItem(`handy-writer:favorites:${root}`, JSON.stringify(favorites));
  },
  [ws, [{ kind: "note", path: HYEOPJAE.path }, { kind: "folder", path: "제주 여행기" }]],
);
await page.reload();
await page.waitForSelector("nav[aria-label='글 목록']");
await sleep(800);

// ───────── 글을 바꾸지 않는 장면 ─────────
await scene("palette", async () => {
  await open("3장 협재의 바다");
  await palette();
  await shot("palette");
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("search", async () => {
  await page.keyboard.press("Control+k");
  await page.getByLabel("검색어").fill("협재 바다");
  await page.getByRole("option").first().waitFor({ timeout: 8000 });
  await sleep(1200);
  await shot("search");
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("manuscript", async () => {
  await treeButton("제주 여행기").click({ button: "right" });
  await page.getByRole("menuitem", { name: "원고로 보기" }).click();
  await page.getByRole("dialog", { name: /^원고:/ }).waitFor();
  await sleep(1200);
  await shot("manuscript");
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("graph", async () => {
  await page.getByRole("button", { name: "그래프 보기" }).click();
  await page.getByLabel("고립된 글 숨기기").check();
  await sleep(3000);
  // 글이 작게 모여 있으니 가운데를 확대한다.
  await page.mouse.move(790, 430);
  await page.mouse.wheel(0, -500);
  await sleep(1500);
  await shot("graph");
  await page.getByRole("button", { name: "그래프 보기" }).click();
  await page.waitForSelector(".note-prose");
  await sleep(500);
});

await scene("history", async () => {
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("dialog").first().waitFor();
  await sleep(2000);
  // 글이 크게 고쳐진 카드(지운 말은 빨강, 쓴 말은 초록)로 넘긴다.
  await page.keyboard.press("ArrowLeft");
  await sleep(2200);
  await shot("history");
  await page.keyboard.press("Escape");
  await sleep(500);
});

await scene("spell", async () => {
  await open("퇴고 연습");
  await tab(/맞춤법/).click();
  await sleep(1500);
  await shot("spell");
  const target = page.locator(".note-prose [data-spell='style:미리 예약']").first();
  await target.hover();
  const popover = page.getByRole("dialog", { name: "문장 다듬기 제안" });
  await popover.waitFor({ timeout: 3000 });
  await sleep(400);
  await shot("spell-popover", await around([target, popover], 40));
  await page.mouse.move(640, 700);
  await sleep(500);
});

await scene("settings", async () => {
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "설정" });
  await settings.waitFor();
  await sleep(400);
  await shot("settings");
  await settings.getByRole("button", { name: /다듬기 규칙/ }).click();
  await page.getByRole("dialog", { name: "문장 다듬기 설정" }).waitFor();
  await sleep(600);
  await shot("style-settings");
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.keyboard.press("Control+/");
  await page.getByRole("dialog", { name: "단축키" }).waitFor();
  await sleep(400);
  await shot("shortcuts");
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("split", async () => {
  await open("1장 도착");
  await tab(/연결/).click();
  await treeButton("제주 맛집").click({ modifiers: ["Alt"] });
  await sleep(1200);
  await shot("split");
  await page.keyboard.press("Control+\\");
  await sleep(500);
});

await scene("tree-menu", async () => {
  await treeButton("2장 한림항의 아침").click({ button: "right" });
  const menu = page.getByRole("menu");
  await menu.waitFor();
  await sleep(300);
  const box = await menu.boundingBox();
  const top = Math.max(0, Math.min(box.y - 140, 820 - 560));
  await shot("tree-menu", { x: 0, y: top, width: 420, height: Math.min(560, 820 - top) });
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("table", async () => {
  await open("표 예시");
  await page.locator(".note-prose td").nth(1).click();
  await page.getByRole("toolbar", { name: "표 편집" }).waitFor();
  await sleep(500);
  await shot("table", { x: 256, y: 36, width: 704, height: 480 });
});

await scene("block-menu", async () => {
  await open("코드 예시");
  const paragraph = page.locator(".note-prose > p", { hasText: "페이지 수를 어림하는" });
  await paragraph.hover();
  const handle = page.getByRole("button", { name: "블록 메뉴" });
  await handle.waitFor({ state: "visible" });
  await handle.click();
  const menu = page.getByRole("menu", { name: "블록 메뉴" });
  await menu.waitFor();
  await sleep(400);
  await shot("block-menu", await around([handle, menu, paragraph], 28));
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("code", async () => {
  await open("코드 예시");
  await sleep(500);
  await shot("code", { x: 256, y: 36, width: 704, height: 560 });
});

await scene("embed", async () => {
  await open("여행 준비");
  await page.getByRole("figure", { name: /끼워 넣은 글: 제주 맛집/ }).getByText("옥돔구이").waitFor({ timeout: 8000 });
  await sleep(600);
  await shot("embed", { x: 256, y: 36, width: 704, height: 640 });
});

await scene("tag-suggest", async () => {
  await open("아이디어");
  const row = page.getByRole("group", { name: "이 글의 태그" });
  await row.getByRole("button", { name: "태그", exact: true }).click();
  await row.getByLabel("추천 태그").getByRole("button").first().waitFor({ timeout: 8000 });
  await sleep(500);
  await shot("tag-suggest", { x: 256, y: 36, width: 704, height: 340 });
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("extract", async () => {
  await palette("링크에서 글");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "링크에서 글 가져오기" }).waitFor();
  await page.getByLabel("가져올 주소").fill("https://example.com/blog/jeju-trip");
  await sleep(500);
  await shot("extract");
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("draft", async () => {
  await palette("AI로 초안");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "AI 초안 만들기" });
  await dialog.waitFor();
  await page.locator("#draft-topic").fill("제주 협재 해변의 하루를 담은 여행 에세이");
  await sleep(600);
  await shot("draft");
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("ai", async () => {
  await open("3장 협재의 바다");
  await tab("AI").click();
  await sleep(1500);
  await shot("ai", { x: 960, y: 0, width: 320, height: 820 });
});

// ───────── 3장 협재의 바다 ─────────
await scene("outline", async () => {
  await tab(/연결/).click();
  await scrollTo(700);
  await sleep(500);
  // 마우스를 올린 상태는 스크린샷을 찍을 때 풀리므로, 포커스로 펼친 모습을 찍는다.
  await page.getByRole("navigation", { name: "목차" }).focus();
  await sleep(900);
  await shot("outline", { x: 256, y: 36, width: 520, height: 420 });
  await page.evaluate(() => document.activeElement?.blur());
});

await scene("width", async () => {
  await scrollTo(0);
  const column = await page.locator("[data-note-column]").boundingBox();
  const handle = page.getByRole("separator", { name: "글 너비 조절 (오른쪽)" });
  await handle.evaluate((el) => el.focus({ focusVisible: true }));
  await sleep(700);
  const right = column.x + column.width;
  await shot("width", { x: Math.max(256, right - 420), y: 36, width: Math.min(704, 1280 - Math.max(256, right - 420)), height: 380 });
  await handle.evaluate((el) => el.blur());
});

await scene("find", async () => {
  await page.locator(".note-prose p").first().click();
  await page.keyboard.press("Control+f");
  const bar = page.getByRole("search", { name: "글 안에서 찾기" });
  await bar.waitFor();
  await page.getByLabel("찾을 말").fill("바다");
  await sleep(700);
  await shot("find", { x: 256, y: 36, width: 704, height: 380 });
  await page.keyboard.press("Escape");
  await bar.waitFor({ state: "detached" });
  await sleep(300);
});

await scene("pages", async () => {
  await sleep(800);
  const marker = page.locator("[data-page-break='2']");
  await marker.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("[data-note-scroller]").scrollBy(0, -330));
  await sleep(500);
  await shot("pages");
});

await scene("footnote", async () => {
  // 본문의 각주 번호 [1]과 ‘그림 1.’ 캡션이 한 화면에 들어오는 자리
  await scrollTo(330);
  await sleep(600);
  await shot("footnote", { x: 256, y: 36, width: 704, height: 740 });
});

await scene("attachments", async () => {
  await tab(/첨부/).click();
  await sleep(500);
  await page.getByRole("button", { name: /협재\.png/ }).first().click().catch(() => {});
  await sleep(700);
  await shot("attachments", { x: 960, y: 0, width: 320, height: 520 });
});

await scene("export", async () => {
  await tab(/연결/).click();
  await scrollTo(0);
  await sleep(300);
  await page.getByRole("button", { name: "내보내기" }).click();
  await sleep(300);
  await shot("export", { x: 270, y: 545, width: 690, height: 275 });
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("focus", async () => {
  await page.locator(".note-prose p", { hasText: "비양도로 가는 배는" }).click();
  await sleep(300);
  await page.keyboard.press("Control+Shift+D");
  await sleep(500);
  await page.keyboard.press("ArrowDown");
  await sleep(1500);
  await shot("focus");
  await page.keyboard.press("Escape");
  await sleep(500);
});

// ───────── 쓰는 장면 (글이 바뀐다) ─────────
await scene("overview", async () => {
  await scrollTo(0);
  await page.getByRole("button", { name: /^속성( \d+)?$/ }).click();
  await sleep(500);
  await shot("properties", { x: 256, y: 36, width: 704, height: 300 });
  await open("2장 한림항의 아침", ["Control"]);
  await open("3장 협재의 바다");
  await page.locator(".note-prose p", { hasText: "마지막 저녁에는" }).click();
  await sleep(200);
  await page.keyboard.press("End");
  await sleep(200);
  await page.keyboard.type(" 내일은 비양도에 들어가 보기로 했다.");
  await sleep(2400);
  await scrollTo(0);
  await page.locator(".note-prose p").first().click();
  await sleep(1000);
  await shot("overview");
  await shot("backlinks", { x: 960, y: 0, width: 320, height: 420 });
});

await scene("stats", async () => {
  await page.getByRole("button", { name: "오늘 쓴 양" }).click();
  const dialog = page.getByRole("dialog", { name: "오늘 쓴 양" });
  await dialog.waitFor();
  await sleep(500);
  await shot("stats", await around([dialog, page.getByRole("button", { name: "오늘 쓴 양" })], 24));
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("count", async () => {
  await page.getByRole("button", { name: /^글자 수/ }).click();
  const dialog = page.getByRole("dialog", { name: "글자 수와 목표 분량" });
  await dialog.waitFor();
  await sleep(400);
  await shot("count", await around([dialog, page.getByRole("button", { name: /^글자 수/ })], 24));
  await page.keyboard.press("Escape");
  await sleep(300);
});

await scene("git", async () => {
  await page.getByRole("button", { name: "Git 상태" }).click();
  await sleep(1500);
  await shot("git");
  await page.getByRole("button", { name: "Git 상태" }).click();
  await sleep(300);
});

await scene("scratch", async () => {
  await open("스크래치");
  // 속성 표를 접어 두면 슬래시 메뉴가 더 또렷하게 보인다.
  const propsToggle = page.getByRole("button", { name: /^속성( \d+)?$/ });
  if ((await propsToggle.getAttribute("aria-expanded")) === "true") await propsToggle.click();
  await sleep(300);
  await page.locator(".note-prose p").last().click();
  await page.keyboard.press("End");
  await sleep(200);
  await page.keyboard.press("Enter");
  await sleep(150);
  await page.keyboard.type("/");
  await page.getByRole("listbox").waitFor();
  await sleep(500);
  await shot("slash-menu", { x: 256, y: 36, width: 704, height: 520 });
  await page.keyboard.type("더 알");
  await sleep(600);
  await shot("template-slash", { x: 256, y: 36, width: 704, height: 440 });
  await page.keyboard.press("Escape");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await sleep(200);
  await page.keyboard.type("[[협재");
  await page.getByRole("listbox").waitFor();
  await sleep(600);
  await shot("wiki-link", { x: 256, y: 36, width: 704, height: 440 });
  await page.keyboard.press("Escape");
});

await scene("conflict", async () => {
  await open("3장 협재의 바다");
  await page.locator(".note-prose p", { hasText: "마지막 저녁에는" }).click();
  await sleep(200);
  await page.keyboard.press("End");
  await sleep(150);
  await page.keyboard.type(" 한 줄 더.");
  const file = path.join(ws, HYEOPJAE.path);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("협재에 도착했다", "협재에 닿았다"));
  const bar = page.getByRole("alert").filter({ hasText: "다른 곳" });
  await bar.waitFor({ timeout: 6000 });
  await sleep(500);
  await bar.getByRole("button", { name: "차이 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "바깥 변경과 내 변경의 차이" });
  await dialog.waitFor();
  await sleep(500);
  await shot("conflict");
  // 해결하지 않고 앱을 닫으면 닫기 확인이 떠서 멈추므로 내 것으로 덮어쓰고 끝낸다.
  await dialog.getByRole("button", { name: "내 것으로 덮어쓰기" }).click();
  await sleep(1000);
});

await env.close();
console.log(`done: ${OUT} (${fs.readdirSync(OUT).filter((f) => f.endsWith(".webp")).length} files)${failed.length ? `, 실패한 장면: ${failed.join(", ")}` : ""}`);
if (failed.length > 0) process.exitCode = 1;
