// 코드블록의 문법 색, 언어 고르기, 복사 버튼을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:code-block`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const source = [
  "# 버튼",
  "",
  "```tsx",
  'import { cva } from "class-variance-authority";',
  "",
  "// 버튼 모양",
  'const buttonVariants = cva("inline-flex gap-2", {',
  '  variants: { size: { md: "h-9 px-4" } },',
  "});",
  "",
  "export function Button({ size = 1 }) {",
  "  return <button className={buttonVariants({ size })} />;",
  "}",
  "```",
  "",
].join("\n");

const longCode = Array.from({ length: 70 }, (_, i) => `const line${i + 1} = ${i + 1}; // 줄 ${i + 1}`).join("\n");
const env = await launchApp({ open: "버튼", files: { "버튼.md": source, "긴코드.md": `# 긴 코드\n\n\`\`\`js\n${longCode}\n\`\`\`\n` } });
const { app, page, ws, logs } = env;
const file = path.join(ws, "버튼.md");

const block = page.locator(".note-prose .code-block").first();
await block.waitFor();
assert((await block.locator(".hljs-keyword").count()) > 0 && (await block.locator(".hljs-string").count()) > 0, "코드에 문법 색을 입힌다");
assert((await block.locator(".hljs-comment").first().innerText()) === "// 버튼 모양", "주석을 따로 칠한다");
const select = page.getByLabel("코드 언어");
assert((await select.inputValue()) === "tsx", "머리줄에 적어 둔 언어(tsx)가 보인다");
await block.hover();
await page.screenshot({ path: path.join(OUT, "code-block.png") });

await page.getByRole("button", { name: "코드 복사" }).click();
await sleep(200);
const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
assert(copied.startsWith('import { cva }') && copied.endsWith("}") && !copied.includes("```"), "복사 버튼은 코드만 복사한다");
assert(await page.getByRole("button", { name: "코드 복사" }).getByText("복사됨").isVisible(), "복사하면 복사됨으로 바뀐다");

await select.selectOption("python");
await sleep(1200);
assert(fs.readFileSync(file, "utf8").includes("```python\n"), "언어를 바꾸면 파일의 펜스에도 저장된다");
await select.selectOption("");
await sleep(1200);
assert(/```\nimport/.test(fs.readFileSync(file, "utf8")), "일반 텍스트를 고르면 언어를 지운다");

// 코드 안에서 고치면 그대로 저장된다
await block.locator(".hljs-comment").first().click();
await page.keyboard.press("End");
await page.keyboard.type(" (md)");
await sleep(1200);
assert(fs.readFileSync(file, "utf8").includes("// 버튼 모양 (md)"), "코드블록 안에서 고친 내용이 저장된다");
ok("코드블록 확인");

// 스크린샷: 화면보다 긴 코드블록도 나눠 찍어 이어 붙이고, 고른 곳에 PNG로 저장하고 클립보드에도 넣는다
await page.locator("nav[aria-label='글 목록']").getByText("긴코드").click();
await page.locator(".note-prose .code-block").first().waitFor();
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("줄 70"));
await sleep(300);
const shotFile = path.join(env.ud, "shot.png");
await app.evaluate(({ dialog }, f) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
}, shotFile);
const longBlock = page.locator(".note-prose .code-block").first();
const blockBox = await longBlock.boundingBox();
const viewport = page.viewportSize() ?? { height: 800 };
assert(blockBox.height > viewport.height, `긴 코드블록은 화면보다 길다 (${Math.round(blockBox.height)}px)`);
await longBlock.hover();
await sleep(300);
const scrollBefore = await page.evaluate(() => document.querySelector("[data-note-scroller]").scrollTop);
await longBlock.getByRole("button", { name: "코드 스크린샷" }).click();
await page.getByText("스크린샷을 저장했어요").waitFor({ timeout: 15000 });
const info = await app.evaluate(async ({ nativeImage, clipboard }, f) => {
  const image = nativeImage.createFromPath(f);
  const { width, height } = image.getSize();
  // 맨 아래 조각(이어 붙인 부분)이 비지 않았는지: 아래쪽 띠의 서로 다른 색 수
  const strip = image.crop({ x: 0, y: Math.max(0, height - 120), width, height: 100 }).toBitmap();
  const colors = new Set();
  for (let i = 0; i < strip.length; i += 4 * 7) colors.add(`${strip[i]},${strip[i + 1]},${strip[i + 2]}`);
  const clip = (await clipboard.read()).flatMap((item) => item.types);
  return { width, height, colors: colors.size, clip };
}, shotFile);
const scale = await page.evaluate(() => window.devicePixelRatio);
assert(Math.abs(info.width - blockBox.width * scale) <= 2 && Math.abs(info.height - blockBox.height * scale) <= 2, `코드블록 크기 그대로 찍힌다 (${info.width}×${info.height}, 블록 ${Math.round(blockBox.width)}×${Math.round(blockBox.height)})`);
assert(info.colors > 3, `나눠 찍은 아래쪽도 비지 않고 이어 붙는다 (색 ${info.colors}가지)`);
assert(info.clip.some((f) => f.includes("image")), `클립보드에도 그림이 들어간다 (${info.clip.join(", ")})`);
await sleep(500);
const scrollAfter = await page.evaluate(() => document.querySelector("[data-note-scroller]").scrollTop);
assert(Math.abs(scrollAfter - scrollBefore) <= 1, `찍고 나면 스크롤이 제자리로 돌아온다 (${scrollBefore} → ${scrollAfter})`);
fs.copyFileSync(shotFile, path.join(OUT, "code-block-shot.png"));

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
