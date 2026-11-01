// 집중 모드(화면 정리, 현재 문단 강조, 타자기 스크롤)를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:focus`
import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";
import path from "node:path";

const { assert } = createReporter();
const paragraphs = Array.from({ length: 40 }, (_v, i) => `${i + 1}번째 문단입니다. 집중해서 글을 쓰는 중이에요. 문단마다 조금 길게 이어서 씁니다.`);
const env = await launchApp({ open: "집중", files: { "집중.md": paragraphs.join("\n\n") + "\n", "다른 글.md": "다른 글\n" } });
const { page, logs } = env;
const mod = "Control";
const waitFor = async (check, tries = 40) => {
  for (let i = 0; i < tries && !(await check()); i++) await sleep(100);
  return check();
};
const dimmed = () => page.locator(".note-prose .focus-dim").count();
const scroller = page.locator("[data-note-scroller]");
const caretOffset = () =>
  page.evaluate(() => {
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const box = document.querySelector("[data-note-scroller]").getBoundingClientRect();
    return { top: (rect.top + rect.bottom) / 2 - box.top, height: box.height };
  });

assert((await dimmed()) === 0, "평소에는 문단을 옅게 하지 않는다");
await page.locator(".note-prose p").nth(4).click();
await sleep(150);
await page.keyboard.press(`${mod}+Shift+D`);

// ── 화면 정리 ──
assert(await waitFor(async () => (await page.locator("nav[aria-label='글 목록']").count()) === 0), "집중 모드에서는 사이드바가 사라진다");
assert((await page.getByRole("tab", { name: "다른 글" }).count()) === 0 && (await page.getByRole("tab", { name: "집중" }).count()) === 0, "탭 막대도 사라진다");
assert((await page.getByRole("tablist", { name: "패널 보기" }).count()) === 0, "오른쪽 패널도 사라진다");
assert(await page.getByRole("button", { name: "집중 모드 끄기" }).isVisible(), "끄는 버튼이 구석에 있다");
assert(await page.locator(".note-prose").isVisible(), "글은 그대로 보인다");

// ── 현재 문단 강조 ──
const total = await page.locator(".note-prose p").count();
assert((await dimmed()) === total - 1, `지금 문단 말고는 모두 옅게 (${await dimmed()}/${total})`);
const current = await page.evaluate(() => {
  const el = document.activeElement?.ownerDocument.querySelector(".note-prose p:not(.focus-dim)");
  return el?.textContent?.slice(0, 3);
});
assert(current === "5번째", `커서가 있는 문단은 진하다 (${current})`);
await sleep(400);
const opacity = await page.locator(".note-prose .focus-dim").first().evaluate((el) => getComputedStyle(el).opacity);
assert(Number(opacity) < 0.6, `옅은 문단의 투명도 (${opacity})`);
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
await sleep(300);
const moved = await page.evaluate(() => [...document.querySelectorAll(".note-prose p:not(.focus-dim)")].map((el) => el.textContent.slice(0, 3)));
assert(moved.length === 1 && moved[0] !== "5번째", `커서를 옮기면 진한 문단도 따라간다 (${moved})`);
await page.screenshot({ path: path.join(OUT, "focus-mode.png") });

// ── 타자기 스크롤: 키보드로 움직이면 커서 줄이 가운데쯤에 온다 ──
await page.keyboard.press(`${mod}+End`);
await sleep(400);
const atEnd = await caretOffset();
assert(Math.abs(atEnd.top - atEnd.height * 0.45) < 40, `글 끝에서도 커서 줄이 가운데쯤에 있다 (${Math.round(atEnd.top)} / ${Math.round(atEnd.height)})`);
await page.keyboard.type("새 문장을 씁니다");
await sleep(300);
const typed = await caretOffset();
assert(Math.abs(typed.top - atEnd.top) < 12, `쓰는 동안 커서 줄이 제자리에 있다 (${Math.round(atEnd.top)} → ${Math.round(typed.top)})`);
const before = await scroller.evaluate((el) => el.scrollTop);
await page.keyboard.press("ArrowUp");
await page.keyboard.press("ArrowUp");
await page.keyboard.press("ArrowUp");
await sleep(300);
const afterUp = await caretOffset();
assert((await scroller.evaluate((el) => el.scrollTop)) < before && Math.abs(afterUp.top - atEnd.top) < 40, "위로 움직이면 글이 따라 내려오고 커서 줄은 그대로다");

// ── 마우스로 누른 자리는 화면을 움직이지 않는다 ──
const clicked = page.locator(".note-prose p").nth(30);
const clickedBox = await clicked.boundingBox();
const scrollBefore = await scroller.evaluate((el) => el.scrollTop);
await clicked.click({ position: { x: 20, y: 6 } });
await sleep(400);
assert(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - scrollBefore) < 4 && clickedBox !== null, "마우스로 누르면 화면이 움직이지 않는다");

// ── 찾기 창이 열려 있을 때 Esc는 찾기만 닫는다 ──
await page.keyboard.press(`${mod}+f`);
await page.getByRole("search", { name: "글 안에서 찾기" }).waitFor();
await page.keyboard.press("Escape");
await page.getByRole("search", { name: "글 안에서 찾기" }).waitFor({ state: "detached" });
assert((await page.locator("nav[aria-label='글 목록']").count()) === 0, "찾기 창을 Esc로 닫아도 집중 모드는 그대로다");

// ── 설정 ──
await page.keyboard.press(`${mod}+,`);
const settings = page.getByRole("dialog", { name: "설정" });
await settings.waitFor();
await settings.getByLabel("지금 쓰는 문단만 진하게").uncheck();
await sleep(300);
assert((await dimmed()) === 0, "설정에서 끄면 문단을 옅게 하지 않는다");
await settings.getByLabel("지금 쓰는 문단만 진하게").check();
await sleep(300);
assert((await dimmed()) > 0, "다시 켜면 옅어진다");
await settings.getByLabel("타자기 스크롤").uncheck();
await page.keyboard.press("Escape");
await page.locator(".note-prose p").nth(36).click();
await sleep(200);
const scrollWithout = await scroller.evaluate((el) => el.scrollTop);
await page.keyboard.press("ArrowUp");
await sleep(300);
const noTypewriter = await caretOffset();
assert(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - scrollWithout) < 4, "타자기 스크롤을 끄면 줄을 옮겨도 글이 따라오지 않는다");
assert(noTypewriter.height > 0 && (await page.locator("nav[aria-label='글 목록']").count()) === 0, "설정 창을 Esc로 닫아도 집중 모드는 그대로다");
assert((await page.evaluate(() => localStorage.getItem("handy-writer:typewriter"))) === "0", "설정은 이 컴퓨터에 기억한다");

// ── 끄기 ──
await page.keyboard.press("Escape");
assert(await waitFor(async () => (await page.locator("nav[aria-label='글 목록']").count()) === 1), "열린 창이 없을 때 Esc로 집중 모드를 끈다");
assert((await dimmed()) === 0 && (await page.getByRole("tab", { name: "집중" }).count()) === 1, "끄면 사이드바·탭이 돌아오고 문단이 다시 진하다");
await page.keyboard.press(`${mod}+Shift+D`);
await page.getByRole("button", { name: "집중 모드 끄기" }).waitFor();
await page.getByRole("button", { name: "집중 모드 끄기" }).click();
assert(await waitFor(async () => (await page.locator("nav[aria-label='글 목록']").count()) === 1), "구석의 버튼으로도 끈다");

// 명령 팔레트
await page.keyboard.press(`${mod}+Shift+P`);
await page.getByLabel("검색어").fill(">집중");
await page.getByRole("option", { name: /집중 모드/ }).click();
assert(await waitFor(async () => (await page.locator("nav[aria-label='글 목록']").count()) === 0), "명령 팔레트로도 켠다");
await page.keyboard.press("Escape");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
