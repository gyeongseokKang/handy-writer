// 탭이나 글 목록의 글을 에디터 쪽으로 끌어 나란히 띄우기(최대 3분할), 너비 손잡이의 눈금자,
// 긴 제목 줄바꿈을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:split-drag`
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const long = "요즘IT-Next.js-모바일-웹을-일주일-만에-앱으로-바꾼-방법-하편-정리본";
const env = await launchApp({
  open: "첫째",
  files: { "첫째.md": "첫 번째 글\n", "둘째.md": "두 번째 글\n", "셋째.md": "세 번째 글\n", "넷째.md": "네 번째 글\n", [`${long}.md`]: "긴 제목\n" },
});
const { page, logs } = env;
const tree = page.getByRole("navigation", { name: "글 목록" });
const sides = page.getByRole("region", { name: /^옆에 연 글/ });

assert((await page.getByRole("button", { name: "옆에 열기" }).count()) === 0, "탭 막대의 분할 버튼이 없다");

/** 글 목록의 글을 끌어 에디터의 x 비율 위치에 놓는다. 놓기 전에 자리 표시를 확인한다. */
async function dragNote(name, xRatio, shot) {
  const area = await page.locator("main").boundingBox();
  const x = area.x + area.width * xRatio;
  const y = area.y + area.height * 0.5;
  await tree.getByText(name, { exact: true }).hover();
  await page.mouse.down();
  await page.mouse.move(x - 30, y, { steps: 5 });
  await page.mouse.move(x, y, { steps: 5 });
  await sleep(150);
  const placeholder = page.getByTestId("split-drop-placeholder");
  const shown = (await placeholder.count()) === 1 ? await placeholder.innerText() : "";
  if (shot) await page.screenshot({ path: path.join(OUT, shot) });
  await page.mouse.up();
  await sleep(500);
  return shown;
}

let label = await dragNote("둘째", 0.85, "split-drop.png");
assert(label.includes("나란히 띄우기"), `끄는 동안 놓을 자리에 '나란히 띄우기'가 보인다 (${label})`);
assert((await sides.count()) === 1 && (await sides.first().getAttribute("aria-label")).includes("둘째"), "놓으면 2분할로 띄운다");

label = await dragNote("셋째", 0.98);
assert((await sides.count()) === 2, "하나 더 끌어 놓으면 3분할");
const names = await sides.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
assert(names[0].includes("둘째") && names[1].includes("셋째"), `놓은 자리 순서대로 놓인다 (${names.join(", ")})`);
assert((await page.locator(".note-prose").count()) === 3, "에디터가 셋 보인다");

label = await dragNote("넷째", 0.98, "split-full.png");
assert(label.includes("최대 3분할"), `가득 차면 자리 표시가 '글 바꾸기'로 바뀐다 (${label})`);
assert((await sides.count()) === 2 && (await sides.nth(1).getAttribute("aria-label")).includes("넷째"), "가득 찼을 때 놓으면 그 자리의 글을 바꾼다");

await sides.first().getByRole("button", { name: "분할 화면 닫기" }).click();
await sleep(300);
assert((await sides.count()) === 1 && (await sides.first().getAttribute("aria-label")).includes("넷째"), "칸마다 따로 닫는다");
await page.keyboard.press("Control+\\");
await sleep(300);
assert((await sides.count()) === 0, "Ctrl+\\는 분할을 모두 닫는다");

// ── 너비 손잡이: ↔ 표시와 끄는 동안 눈금자 ──
const handle = page.getByRole("separator", { name: "오른쪽 패널 너비 조절" });
assert((await handle.locator("svg").count()) === 0, "사이드 패널 손잡이에는 아이콘 없이 선만 있다");
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 5 });
const ruler = page.getByTestId("width-ruler");
const rulerText = (await ruler.count()) ? await ruler.innerText() : "";
await page.screenshot({ path: path.join(OUT, "width-ruler.png") });
await page.mouse.up();
await sleep(200);
assert(/\d+px/.test(rulerText), `끄는 동안 눈금자에 지금 너비가 보인다 (${rulerText.split("\n").pop()})`);
assert((await ruler.count()) === 0, "놓으면 눈금자가 사라진다");

// ── 긴 제목은 줄을 넘긴다 ──
await tree.getByText(long, { exact: true }).click();
await sleep(400);
const title = page.locator("[aria-label='글 제목']");
const t = await title.evaluate((el) => ({ h: el.getBoundingClientRect().height, sw: el.scrollWidth, cw: el.clientWidth }));
assert(t.h > 60 && t.sw <= t.cw, `긴 제목이 잘리지 않고 여러 줄로 보인다 (높이 ${Math.round(t.h)})`);
await page.screenshot({ path: path.join(OUT, "long-title.png") });

// ── 글을 선택한 채로 Tab: 블록 종류 메뉴가 뜨고 포커스가 옮겨 간다 ──
await tree.getByText("첫째", { exact: true }).click();
await sleep(400);
const prose = page.locator(".note-prose").first();
await prose.locator("p").first().click();
await page.keyboard.press("Home");
await page.keyboard.press("Shift+End");
await sleep(300);
const bold = page.getByRole("button", { name: "굵게" });
await bold.hover();
await sleep(150);
const hint = page.getByRole("tooltip").filter({ hasText: "굵게" });
assert((await hint.isVisible()) && /B/.test(await hint.innerText()), `서식 버튼에 올리면 단축키가 보인다 (${(await hint.innerText()).replace(/\s+/g, " ")})`);
await page.screenshot({ path: path.join(OUT, "bubble-hint.png") });
await prose.locator("p").first().click();
await page.keyboard.press("Home");
await page.keyboard.press("Shift+End");
await sleep(200);
await page.keyboard.press("Tab");
await sleep(200);
const blockMenu = page.getByRole("menu", { name: "블록 종류" });
assert(await blockMenu.isVisible(), "선택한 채로 Tab을 누르면 블록 종류 메뉴가 뜬다");
assert((await page.evaluate(() => document.activeElement?.textContent ?? "")).includes("본문"), "포커스가 지금 종류(본문)로 옮겨 간다");
await page.keyboard.press("ArrowDown");
assert((await page.evaluate(() => document.activeElement?.textContent ?? "")).includes("제목 1"), "화살표로 항목을 옮긴다");
await page.screenshot({ path: path.join(OUT, "bubble-tab-menu.png") });
await page.keyboard.press("Enter");
await sleep(300);
assert((await prose.locator("h1").count()) === 1, "Enter로 고른 종류로 바뀐다");
assert(await page.evaluate(() => !!document.activeElement?.closest(".ProseMirror")), "고르고 나면 에디터로 포커스가 돌아온다");
await page.keyboard.press("Home");
await page.keyboard.press("Shift+End");
await page.keyboard.press("Tab");
await sleep(200);
await page.keyboard.press("Escape");
await sleep(200);
assert(!(await blockMenu.isVisible()) && (await page.evaluate(() => !!document.activeElement?.closest(".ProseMirror"))), "Esc로 닫으면 에디터로 돌아간다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
