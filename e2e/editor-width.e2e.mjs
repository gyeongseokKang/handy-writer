// 글 칸 너비 손잡이(양쪽이 같이 움직임, 기억, 두 번 눌러 기본값)와 창 크기에 맞춰 줄어드는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:editor-width`
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({ open: "넓게", files: { "넓게.md": `# 넓게\n\n${"아주 긴 문장을 계속 이어서 씁니다. ".repeat(40)}\n` } });
const { page, logs } = env;

// launchApp이 화면 크기를 고정해 두므로 창 크기 대신 화면 크기를 바꾼다.
const setWindow = (width, height) => page.setViewportSize({ width, height });
const column = () => page.locator("[data-note-column]").evaluate((el) => {
  const rect = el.getBoundingClientRect();
  const scroller = el.closest("[data-note-scroller]").getBoundingClientRect();
  return { width: Math.round(rect.width), left: Math.round(rect.left - scroller.left), right: Math.round(scroller.right - rect.right) };
});
const right = page.getByRole("separator", { name: "글 너비 조절 (오른쪽)" });
const left = page.getByRole("separator", { name: "글 너비 조절 (왼쪽)" });

await setWindow(2000, 900);
await sleep(500);
await page.waitForSelector(".note-prose");
const start = await column();
assert(start.width === 768, `처음에는 기본 너비다 (${start.width})`);

// 오른쪽 손잡이를 100px 끌면 양쪽이 같이 넓어져 200px 늘어나고 가운데는 그대로다
async function dragBy(handle, dx) {
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
  await sleep(200);
}
await dragBy(right, 100);
const wider = await column();
assert(wider.width === 968, `오른쪽을 끌면 끈 만큼 양쪽으로 넓어진다 (${wider.width})`);
assert(Math.abs(wider.left - wider.right) <= 1, `넓어져도 가운데 정렬이다 (${wider.left} / ${wider.right})`);
await page.screenshot({ path: path.join(OUT, "editor-width-wide.png") });

// 왼쪽 손잡이를 안쪽(오른쪽)으로 끌면 좁아진다
await dragBy(left, 150);
assert((await column()).width === 668, `왼쪽을 안쪽으로 끌면 양쪽이 같이 좁아진다 (${(await column()).width})`);

// 너무 좁게는 못 줄인다
await dragBy(left, 600);
assert((await column()).width === 480, `최소 너비보다 좁아지지 않는다 (${(await column()).width})`);

// 키보드로도 조절된다
await right.focus();
await page.keyboard.press("ArrowRight");
assert((await column()).width === 544, `키보드 화살표로도 조절된다 (${(await column()).width})`);

// 기억했다가 다시 열어도 그 너비다
await dragBy(right, 300);
const saved = (await column()).width;
await page.reload();
await page.waitForSelector("[data-note-column]");
await sleep(300);
assert((await column()).width === saved, `다시 열어도 조절한 너비를 기억한다 (${saved})`);

// 창이 좁아지면 창에 맞춰 줄어든다
await setWindow(1100, 800);
await sleep(500);
const narrow = await column();
const scrollerWidth = await page.locator("[data-note-scroller]").evaluate((el) => el.clientWidth);
assert(narrow.width <= scrollerWidth && narrow.width < saved, `창이 좁으면 글 칸이 창에 맞춰 줄어든다 (${narrow.width} / ${scrollerWidth})`);
await page.screenshot({ path: path.join(OUT, "editor-width-narrow.png") });
await setWindow(2000, 900);
await sleep(500);
assert((await column()).width === saved, "창을 다시 넓히면 조절한 너비로 돌아간다");

// 두 번 누르면 기본 너비로
await right.dblclick();
await sleep(200);
assert((await column()).width === 768, `손잡이를 두 번 누르면 기본 너비로 돌아간다 (${(await column()).width})`);
ok("글 너비 조절 확인");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
