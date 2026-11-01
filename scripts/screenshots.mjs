// README에 쓰는 화면 캡처를 만든다. 가상의 제주 여행 원고가 든 작업 폴더(git 기록 포함)로 앱을 띄워 장면마다 찍는다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm docs:screenshots`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { launchApp, sleep } from "../e2e/helpers.mjs";
import { FILES, HYEOPJAE, MANUSCRIPTS } from "./demo-content.mjs";

const OUT = path.resolve(import.meta.dirname, "../docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);

/** 작업 폴더에 글과 git 기록(협재의 바다가 네 번 고쳐진 기록)을 만든다. */
function setup(ws) {
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    fs.writeFileSync(path.join(ws, rel), text);
  };
  fs.mkdirSync(path.join(ws, "attachments"), { recursive: true });
  fs.copyFileSync(path.join(import.meta.dirname, "demo", "hyeopjae.png"), path.join(ws, "attachments", "협재.png"));
  const git = (args, date) =>
    execFileSync("git", ["-c", "user.name=한결", "-c", "user.email=hangyeol@example.com", ...args], {
      cwd: ws,
      env: { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
      stdio: "ignore",
    });
  git(["init", "-q", "-b", "main"]);
  for (const [rel, text] of Object.entries(FILES)) write(rel, text);
  write(".handy-writer/manuscripts.json", `${JSON.stringify(MANUSCRIPTS, null, 2)}\n`);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "제주 여행기 원고 시작"], "2026-10-10T20:00:00");
  for (const version of HYEOPJAE.versions) {
    write(HYEOPJAE.path, version.text);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", version.message], version.date);
  }
}

const env = await launchApp({ setup, env: { HANDY_WRITER_TZ: "Asia/Seoul" } });
const { page, ws } = env;
const tree = page.locator("nav[aria-label='글 목록']");
const shot = async (name, options = {}) => {
  if (!want(name)) return;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...options });
  console.log("shot:", name);
};
const open = async (name, modifiers = []) => {
  await tree.getByRole("button", { name, exact: true }).click({ modifiers });
  await page.waitForSelector(".note-prose");
  await sleep(500);
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

// ── 명령 팔레트 ──
await open("3장 협재의 바다");
await page.keyboard.press("Control+Shift+P");
await page.getByLabel("검색어").waitFor();
await sleep(500);
await shot("palette");
await page.keyboard.press("Escape");
await sleep(300);

// ── 원고 묶기 ──
await tree.getByRole("button", { name: "제주 여행기", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "원고로 보기" }).click();
await page.getByRole("dialog", { name: /^원고:/ }).waitFor();
await sleep(1200);
await shot("manuscript");
await page.keyboard.press("Escape");
await sleep(300);

// ── 그래프 ──
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

// ── 변경 기록 ──
await page.getByRole("button", { name: "기록", exact: true }).click();
await page.getByRole("dialog").first().waitFor();
await sleep(2000);
// 글이 크게 고쳐진 카드(지운 말은 빨강, 쓴 말은 초록)로 넘긴다.
await page.keyboard.press("ArrowLeft");
await sleep(2200);
await shot("history");
await page.keyboard.press("Escape");
await sleep(500);

// ── 맞춤법·문장 다듬기·표기 통일 ──
await open("퇴고 연습");
await page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: /맞춤법/ }).click();
await sleep(1500);
await shot("spell");

// ── 분할 화면 ──
await open("1장 도착");
await page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: /연결/ }).click();
await tree.getByRole("button", { name: "제주 맛집", exact: true }).click({ modifiers: ["Alt"] });
await sleep(1200);
await shot("split");
await page.keyboard.press("Control+\\");
await sleep(500);
await open("3장 협재의 바다");

// ── 내보내기 메뉴와 아래 막대 ──
await page.getByRole("button", { name: "내보내기" }).click();
await sleep(300);
await shot("export", { clip: { x: 270, y: 545, width: 690, height: 275 } });
await page.keyboard.press("Escape");
await sleep(300);

// ── 집중 모드 ──
await page.locator(".note-prose p", { hasText: "비양도로 가는 배는" }).click();
await sleep(300);
await page.keyboard.press("Control+Shift+D");
await sleep(500);
await page.keyboard.press("ArrowDown");
await sleep(1500);
await shot("focus");
await page.keyboard.press("Escape");
await sleep(500);

// ── A4 쪽 나누기 ──
await sleep(1500);
const breakMarker = page.locator("[data-page-break='2']");
if (await breakMarker.count()) {
  await breakMarker.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("[data-note-scroller]").scrollBy(0, -330));
  await sleep(500);
  await shot("pages");
}

// ── 개요 (맨 위로, 속성 펼침, 오늘 쓴 양이 보이게 한 줄 더 쓴다) ──
await page.evaluate(() => document.querySelector("[data-note-scroller]").scrollTo(0, 0));
await page.getByRole("button", { name: /^속성( \d+)?$/ }).click();
await open("2장 한림항의 아침", ["Control"]);
await open("3장 협재의 바다");
const last = page.locator(".note-prose p", { hasText: "마지막 저녁에는" });
await last.click();
await sleep(200);
await page.keyboard.press("End");
await sleep(200);
await page.keyboard.type(" 내일은 비양도에 들어가 보기로 했다.");
await sleep(2200);
await page.evaluate(() => document.querySelector("[data-note-scroller]").scrollTo(0, 0));
await page.locator(".note-prose p").first().click();
await sleep(1000);
await shot("overview");

await env.close();
console.log("done:", OUT);
