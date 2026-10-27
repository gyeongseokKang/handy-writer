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

const env = await launchApp({ open: "버튼", files: { "버튼.md": source } });
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

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
