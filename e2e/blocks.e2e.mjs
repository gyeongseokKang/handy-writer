// 블록 종류 바꾸기(단축키, 선택 막대, 블록 손잡이 메뉴), 블록 옮기기·복제, 서식 없이 붙여넣기를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:blocks`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const env = await launchApp({ open: "블록", files: { "블록.md": "첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.\n" } });
const { app, page, ws, logs } = env;
const file = path.join(ws, "블록.md");
const read = () => fs.readFileSync(file, "utf8");
const waitFor = async (check, tries = 40) => {
  for (let i = 0; i < tries && !(await check()); i++) await sleep(150);
  return check();
};
const saved = (expected) => waitFor(() => read() === expected);
const para = (text) => page.locator(".note-prose > *", { hasText: text }).first();
const focusOn = async (text) => {
  await para(text).click();
  await sleep(200);
};

// ── 단축키로 블록 종류 바꾸기 (Notion과 같은 Ctrl/Cmd+Alt+숫자) ──
await focusOn("둘째");
const steps = [
  ["Control+Alt+2", "첫 문단입니다.\n\n## 둘째 문단입니다.\n\n셋째 문단입니다.\n", "Ctrl+Alt+2는 제목 2"],
  ["Control+Alt+5", "첫 문단입니다.\n\n- 둘째 문단입니다.\n\n셋째 문단입니다.\n", "Ctrl+Alt+5는 글머리 기호 목록 (제목에서 바로 바뀐다)"],
  ["Control+Alt+6", "첫 문단입니다.\n\n1. 둘째 문단입니다.\n\n셋째 문단입니다.\n", "Ctrl+Alt+6은 번호 목록"],
  ["Control+Alt+4", "첫 문단입니다.\n\n- [ ] 둘째 문단입니다.\n\n셋째 문단입니다.\n", "Ctrl+Alt+4는 할 일 목록"],
  ["Control+Alt+7", "첫 문단입니다.\n\n> 둘째 문단입니다.\n\n셋째 문단입니다.\n", "Ctrl+Alt+7은 인용"],
  ["Control+Alt+0", "첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.\n", "Ctrl+Alt+0은 본문"],
];
for (const [keys, expected, message] of steps) {
  await page.keyboard.press(keys);
  assert(await saved(expected), `${message}\n${read()}`);
}
await page.keyboard.press("Control+Alt+8");
assert(await waitFor(() => read().includes("```\n둘째 문단입니다.\n```")), "Ctrl+Alt+8은 코드 블록");
await page.keyboard.press("Control+Alt+0");
assert(await saved("첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.\n"), "코드 블록도 본문으로 돌아온다");

// ── 블록 옮기기·복제 ──
await page.keyboard.press("Control+Shift+ArrowUp");
assert(await saved("둘째 문단입니다.\n\n첫 문단입니다.\n\n셋째 문단입니다.\n"), "Ctrl+Shift+↑는 블록을 위로 옮긴다");
await page.keyboard.press("Control+Shift+ArrowDown");
assert(await saved("첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.\n"), "Ctrl+Shift+↓는 아래로 옮긴다");
await page.keyboard.type("!");
assert(await saved("첫 문단입니다.\n\n둘째 문단입니다.!\n\n셋째 문단입니다.\n") || (await saved("첫 문단입니다.\n\n!둘째 문단입니다.\n\n셋째 문단입니다.\n")), "옮긴 뒤에도 커서가 그 블록 안에 있다");
await page.keyboard.press("Backspace");
await page.keyboard.press("Control+d");
assert(await waitFor(() => (read().match(/둘째 문단입니다\./g) ?? []).length === 2), "Ctrl+D는 블록을 복제한다");

// ── 블록 손잡이 메뉴: 눌러서 종류 바꾸기, 삭제 ──
const handleMenu = async (text) => {
  await para(text).hover();
  const handle = page.getByRole("button", { name: "블록 메뉴" });
  await handle.waitFor({ state: "visible" });
  await handle.click();
  const menu = page.getByRole("menu", { name: "블록 메뉴" });
  await menu.waitFor();
  return menu;
};
let menu = await handleMenu("첫 문단");
assert(await menu.getByRole("menuitem", { name: /^본문/ }).isVisible() && (await menu.getByRole("menuitem").count()) === 11, "손잡이를 누르면 블록 종류 9가지와 복제·삭제가 있는 메뉴가 뜬다");
await menu.getByRole("menuitem", { name: /^제목 1/ }).click();
assert(await waitFor(() => read().startsWith("# 첫 문단입니다.\n")), `메뉴에서 고르면 그 블록이 바뀐다\n${read()}`);
await page.screenshot({ path: path.join(OUT, "block-menu.png") });
menu = await handleMenu("첫 문단");
await menu.getByRole("menuitem", { name: /^삭제/ }).click();
assert(await waitFor(() => !read().includes("첫 문단입니다.")), "메뉴의 삭제는 그 블록을 지운다");

// ── 선택 막대의 블록 종류 ──
const second = para("둘째 문단입니다.");
await second.click({ clickCount: 3 });
const toolbarButton = page.getByRole("button", { name: "블록 종류" });
await toolbarButton.waitFor();
assert((await toolbarButton.innerText()).trim() === "본문", "글자를 선택하면 막대에 지금 블록 종류가 보인다");
await toolbarButton.click();
await page.getByRole("menuitemradio", { name: /^제목 3/ }).click();
assert(await waitFor(() => read().includes("### 둘째 문단입니다.")), "막대에서 고르면 선택한 블록이 바뀐다");
assert((await toolbarButton.innerText()).trim() === "제목 3", "바뀐 종류가 막대에 보인다");

// ── 빈 제목 블록은 몇 단계인지 알려 준다 ──
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.press("Control+Alt+2");
await sleep(300);
const placeholder = await page.locator(".note-prose h2.is-empty, .note-prose h2[data-placeholder]").last().getAttribute("data-placeholder");
assert(placeholder === "제목 2", `빈 제목 블록의 안내 글자에 단계가 보인다 (${placeholder})`);
await page.keyboard.press("Control+Alt+3");
await sleep(300);
assert((await page.locator(".note-prose h3[data-placeholder]").last().getAttribute("data-placeholder")) === "제목 3", "단계를 바꾸면 안내 글자도 바뀐다");

// ── 서식 없이 붙여넣기 (Electron 기본 메뉴에는 없는 Ctrl/Cmd+Shift+V) ──
await page.keyboard.type("붙일 자리");
await page.keyboard.press("Control+Alt+0");
await page.keyboard.press("End");
await app.evaluate(({ clipboard, ClipboardItem }) =>
  clipboard.write([new ClipboardItem({ "text/plain": "서식 없는 글", "text/html": "<strong>굵은 글</strong>" })]),
);
await page.keyboard.press("Control+Shift+V");
assert(await waitFor(() => read().includes("붙일 자리서식 없는 글")), `Ctrl+Shift+V는 글자만 붙여 넣는다\n${read()}`);
assert(!read().includes("굵은 글") && !read().includes("**서식"), "굵은 글씨 같은 서식은 가져오지 않는다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
