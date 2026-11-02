// 사이드바에서 글과 폴더를 끌어서 옮기는 것을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:tree-dnd`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();

const env = await launchApp({
  open: "첫글",
  files: {
    "첫글.md": "# 첫글\n\n본문\n",
    "자료/참고.md": "# 참고\n",
    "자료/하위/깊은글.md": "# 깊은글\n",
    "보관/빈.md": "# 빈\n",
    "보관/첫글.md": "# 같은 이름\n",
  },
});
const { page, ws, logs } = env;
page.on("dialog", (dialog) => void dialog.accept());

const tree = page.locator("nav[aria-label='글 목록']");
const exists = (rel) => fs.existsSync(path.join(ws, rel));
const folder = (p) => tree.locator(`[data-folder-path="${p}"]`);
const note = (rel) => tree.locator(`button[title^="${rel}"]`);
const waitFor = async (test) => {
  for (let i = 0; i < 40; i++) {
    if (test()) return true;
    await sleep(150);
  }
  return false;
};

// 글 → 폴더
await page.getByRole("button", { name: "자료", exact: true }).waitFor();
await note("첫글.md").click(); // 이름이 같은 글이 있어서 연 글이 맞는지 직접 연다
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("본문"));
await note("첫글.md").dragTo(folder("자료"));
assert(await waitFor(() => exists("자료/첫글.md") && !exists("첫글.md")), "글을 폴더 위로 끌어다 놓으면 그 폴더로 옮겨진다");
await sleep(500);
assert((await page.locator(".note-prose").textContent())?.includes("본문"), "열려 있던 글은 옮긴 뒤에도 그대로 열려 있다");
await page.locator(".note-prose p", { hasText: "본문" }).click();
await page.keyboard.press("End");
await page.keyboard.type(" 덧붙임");
assert(await waitFor(() => fs.existsSync(path.join(ws, "자료/첫글.md")) && fs.readFileSync(path.join(ws, "자료/첫글.md"), "utf8").includes("본문 덧붙임")), "옮긴 뒤에 쓴 글은 새 자리에 저장된다");

// 폴더 → 폴더 (안의 글과 하위 폴더도 함께)
await folder("자료/하위").dragTo(folder("보관"));
assert(await waitFor(() => exists("보관/하위/깊은글.md") && !exists("자료/하위")), "폴더를 다른 폴더 위로 끌어다 놓으면 안의 글과 함께 옮겨진다");
assert(await folder("보관/하위").isVisible(), "들어간 폴더는 펼쳐져서 옮겨진 것이 보인다");

// 폴더를 자기 안으로는 옮기지 않는다.
await folder("보관").dragTo(folder("보관/하위"));
await sleep(500);
assert(exists("보관/빈.md") && exists("보관/하위/깊은글.md"), "폴더를 자기 안으로 끌어다 놓아도 아무것도 바뀌지 않는다");

// 이름이 같은 글이 있는 폴더로는 옮기지 못하고 알려 준다.
await note("자료/첫글.md").dragTo(folder("보관"));
await page.getByText("같은 이름의 글이 이미 있어요").waitFor();
assert(exists("자료/첫글.md") && exists("보관/첫글.md"), "같은 이름이 있으면 옮기지 않고 알려 준다");

// 끌고 가는 동안 놓을 폴더가 강조된다.
const source = await note("자료/참고.md").boundingBox();
const target = await folder("보관").boundingBox();
await page.mouse.move(source.x + 30, source.y + source.height / 2);
await page.mouse.down();
await page.mouse.move(source.x + 40, source.y + source.height / 2 + 6, { steps: 3 });
await page.mouse.move(target.x + 40, target.y + target.height / 2, { steps: 12 });
await page.mouse.move(target.x + 44, target.y + target.height / 2 + 1, { steps: 2 });
await page.waitForSelector('[data-folder-path="보관"][data-drop-target]');
await page.screenshot({ path: path.join(OUT, "tree-dnd.png") });
assert(true, "끌고 가는 동안 놓을 폴더가 강조된다");
await page.mouse.up();
assert(await waitFor(() => exists("보관/참고.md") && !exists("자료/참고.md")), "마우스로 끌어서도 옮겨진다");

// 빈 곳에 놓으면 맨 위(작업 폴더)로 나온다.
await folder("보관/하위").dragTo(folder("자료"));
assert(await waitFor(() => exists("자료/하위/깊은글.md")), "폴더를 다른 폴더로 옮긴다");
const box = await tree.boundingBox();
const root = page.locator("div[data-drop-target], div.min-h-full").first();
const rootBox = await tree.locator("xpath=..").boundingBox();
await folder("자료/하위").dragTo(tree.locator("xpath=.."), { targetPosition: { x: 40, y: rootBox.height - 6 } });
assert(await waitFor(() => exists("하위/깊은글.md") && !exists("자료/하위")), "빈 곳에 놓으면 작업 폴더 맨 위로 옮겨진다");
void box;
void root;

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
