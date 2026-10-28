// 글 안에서 찾기·바꾸기, 글자 수, 표 편집 막대를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:editor-tools`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const source = "# 제목\n\n사과와 배, 그리고 사과.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n끝의 사과\n";
const env = await launchApp({ open: "내글", files: { "내글.md": source } });
const { page, ws, logs } = env;
const file = path.join(ws, "내글.md");

// 글자 수
const count = page.locator("footer [aria-label^='글자 수']");
assert(/자 · 약 1분/.test(await count.innerText()), `글자 수가 보인다 (${await count.innerText()})`);

// 찾기
await page.locator(".note-prose").click();
await page.keyboard.press("Control+f");
const bar = page.getByRole("search", { name: "글 안에서 찾기" });
await bar.waitFor();
assert(await bar.getByLabel("찾을 말").evaluate((el) => el === document.activeElement), "Ctrl+F는 찾는 칸에 포커스를 둔다");
await page.keyboard.type("사과");
await sleep(200);
assert((await page.locator(".note-prose .find-match").count()) === 3, "일치하는 3곳을 칠한다");
assert((await bar.innerText()).includes("1 / 3"), "1 / 3으로 센다");
await page.keyboard.press("Enter");
assert((await bar.innerText()).includes("2 / 3"), "Enter는 다음 결과로 간다");
await page.keyboard.press("Shift+Enter");
await page.keyboard.press("Shift+Enter");
assert((await bar.innerText()).includes("3 / 3"), "Shift+Enter는 이전으로 돌아 끝으로 간다");
await page.keyboard.type("zzz");
await sleep(200);
assert((await bar.innerText()).includes("결과 없음"), "없는 말은 결과 없음");

// 바꾸기
await bar.getByLabel("찾을 말").fill("사과");
await bar.getByLabel("바꾸기", { exact: true }).check();
await bar.getByLabel("바꿀 말").fill("귤");
await bar.getByRole("button", { name: "모두 바꾸기" }).click();
await sleep(1200);
const saved = fs.readFileSync(file, "utf8");
assert(!saved.includes("사과") && (saved.match(/귤/g) ?? []).length === 3, "모두 바꾸기가 파일까지 저장된다");

await page.keyboard.press("Escape");
await sleep(200);
assert((await page.getByRole("search").count()) === 0 && (await page.locator(".find-match").count()) === 0, "Esc로 닫으면 표시도 사라진다");

// 표 편집
await page.locator(".note-prose td").first().click();
const toolbar = page.getByRole("toolbar", { name: "표 편집" });
await toolbar.waitFor();
await page.screenshot({ path: path.join(OUT, "table-menu.png") });
await toolbar.getByRole("button", { name: "아래에 행" }).click();
await toolbar.getByRole("button", { name: "오른쪽에 열" }).click();
await sleep(1200);
const table = fs.readFileSync(file, "utf8").split("\n").filter((line) => line.startsWith("|"));
assert(table.length === 4 && table[0].split("|").length === 5, `행과 열이 늘어난다 (${table.length}행)`);
await toolbar.getByRole("button", { name: "표 삭제" }).click();
await sleep(1200);
assert(!fs.readFileSync(file, "utf8").includes("|"), "표 삭제");
await page.locator(".note-prose p").first().click();
await sleep(300);
assert((await page.getByRole("toolbar", { name: "표 편집" }).count()) === 0, "표 밖에서는 막대가 숨는다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
