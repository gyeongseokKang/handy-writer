// 왼쪽 사이드바와 오른쪽 패널의 가장자리를 끌어 너비를 바꾸고, 다시 열어도 기억하는지,
// 탭 막대 끝의 버튼으로 오른쪽 패널을 접고 펴는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:panel-width`
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();
const env = await launchApp({ open: "글", files: { "글.md": "# 글\n\n본문\n" } });
const { page, logs } = env;

const widthOf = (selector) => page.locator(selector).evaluate((el) => Math.round(el.getBoundingClientRect().width));
const drag = async (label, dx) => {
  const box = await page.getByRole("separator", { name: label }).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
  await sleep(200);
};

const right = "aside[aria-label='사이드 패널']";
const before = await widthOf(right);
await drag("오른쪽 패널 너비 조절", -120);
const wider = await widthOf(right);
assert(wider === before + 120, `오른쪽 패널 왼쪽 가장자리를 왼쪽으로 끌면 넓어진다 (${before} → ${wider})`);
await drag("오른쪽 패널 너비 조절", 2000);
assert((await widthOf(right)) === 260, "너무 좁게는 줄지 않는다 (최소 260)");
await drag("오른쪽 패널 너비 조절", -200);
const saved = await widthOf(right);

const sidebar = "aside:has([aria-label='사이드바 너비 조절'])";
const sideBefore = await widthOf(sidebar);
await drag("사이드바 너비 조절", 60);
assert((await widthOf(sidebar)) === sideBefore + 60, "왼쪽 사이드바도 그대로 끌어서 바뀐다");

await page.reload();
await page.waitForSelector(right);
assert((await widthOf(right)) === saved, `다시 열어도 오른쪽 패널 너비를 기억한다 (${saved})`);
await page.getByRole("separator", { name: "오른쪽 패널 너비 조절" }).dblclick();
await sleep(200);
assert((await widthOf(right)) === 320, "두 번 누르면 기본 너비(320)로 돌아간다");
await page.screenshot({ path: path.join(OUT, "panel-width.png") });

// 접기 버튼은 탭 막대 오른쪽 끝(패널 바로 옆)에 있다
const toggle = page.getByRole("button", { name: "오른쪽 패널" });
const tBox = await toggle.boundingBox();
const pBox = await page.locator(right).boundingBox();
assert(Math.abs(tBox.x + tBox.width - pBox.x) <= 2, "패널 접기 버튼이 오른쪽 패널 바로 왼쪽에 붙어 있다");
assert((await page.getByRole("button", { name: "연결 정보 패널" }).count()) === 0, "왼쪽 사이드바 위에는 패널 버튼이 없다");
await toggle.click();
await sleep(200);
assert((await page.locator(right).count()) === 0, "누르면 오른쪽 패널을 접는다");
await toggle.click();
await sleep(200);
assert((await page.locator(right).count()) === 1, "다시 누르면 펼친다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
