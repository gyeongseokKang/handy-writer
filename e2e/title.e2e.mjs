// 본문 첫 `# 제목`이 글 제목과 같을 때 위쪽 제목이 대신하는 것(숨김, 이름을 바꾸면 같이 바뀜, 커서·Backspace, 내보내기, 목차)을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:title`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const env = await launchApp({
  open: "옛 제목",
  files: {
    "옛 제목.md": "---\ntags: [시험]\n---\n\n# 옛 제목\n\n첫 문단입니다.\n\n## 소제목\n\n둘째 문단입니다.\n",
    "다른 글.md": "# 다른 제목\n\n본문\n",
    "머리만.md": "# 머리만\n",
  },
});
const { app, page, ws, logs } = env;
const read = (rel) => fs.readFileSync(path.join(ws, rel), "utf8");
const waitFor = async (check, tries = 40) => {
  for (let i = 0; i < tries && !(await check()); i++) await sleep(150);
  return check();
};
const tree = page.locator("nav[aria-label='글 목록']");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hw-title-"));

// ── 숨김 ──
const echo = page.locator(".note-prose > h1.title-echo");
assert((await echo.count()) === 1 && !(await echo.isVisible()), "글 제목과 같은 맨 앞 제목은 본문에서 보이지 않는다");
const heading = page.locator(".note-prose h2", { hasText: "소제목" });
assert(await heading.isVisible(), "나머지 글은 그대로 보인다");
assert(read("옛 제목.md").includes("# 옛 제목\n"), "파일에는 그 줄이 그대로 있다");

// 제목이 다른 글은 숨기지 않는다.
await tree.getByRole("button", { name: "다른 글", exact: true }).click();
await page.waitForSelector(".note-prose");
assert((await page.locator(".note-prose > h1").first().isVisible()) && (await page.locator(".note-prose > h1.title-echo").count()) === 0, "글 제목과 다른 맨 앞 제목은 그대로 보인다");
await tree.getByRole("button", { name: "옛 제목", exact: true }).click();
await page.waitForSelector(".note-prose h2");

// ── 목차에서도 빠진다 ──
await page.getByRole("navigation", { name: "목차" }).hover();
const outlineItems = await page.getByRole("navigation", { name: "목차" }).getByRole("button").allTextContents();
assert(!outlineItems.some((t) => t.includes("옛 제목")) && outlineItems.some((t) => t.includes("소제목")), `목차에는 숨긴 제목이 없다 (${outlineItems.join(", ")})`);
await page.mouse.move(640, 700);

// ── 제목에서 Enter: 본문 첫 자리로 ──
await page.getByLabel("글 제목").click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await sleep(200);
await page.keyboard.type("앞에 ");
await sleep(1200);
assert(read("옛 제목.md").includes("# 옛 제목\n\n앞에 첫 문단입니다."), `제목에서 Enter하면 숨긴 줄이 아니라 본문 첫 문단에 쓴다\n${read("옛 제목.md")}`);

// ── Backspace는 숨긴 줄과 합치지 않는다 ──
await page.keyboard.press("Home");
for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
await page.keyboard.press("Home");
await page.keyboard.press("Backspace");
await sleep(1200);
assert(read("옛 제목.md").includes("# 옛 제목\n\n앞에 첫 문단입니다."), "본문 맨 앞에서 Backspace해도 숨긴 제목과 합쳐지지 않는다");

// ── 이름을 바꾸면 그 줄도 같이 바뀐다 ──
await tree.getByRole("button", { name: "옛 제목", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "이름 바꾸기" }).click();
await page.getByLabel("옛 제목 새 이름").fill("새 제목");
await page.getByLabel("옛 제목 새 이름").press("Enter");
assert(await waitFor(() => fs.existsSync(path.join(ws, "새 제목.md"))), "이름이 바뀐다");
assert(await waitFor(() => read("새 제목.md").includes("# 새 제목\n")) && !read("새 제목.md").includes("# 옛 제목"), `이름을 바꾸면 맨 앞 제목 줄도 같이 바뀐다\n${read("새 제목.md")}`);
assert(read("새 제목.md").startsWith("---\ntags: [시험]\n---\n\n# 새 제목\n\n앞에 첫 문단입니다."), "frontmatter와 나머지 본문은 그대로다");
await page.waitForSelector(".note-prose h2");
assert((await page.locator(".note-prose > h1.title-echo").count()) === 1 && !(await page.locator(".note-prose > h1.title-echo").isVisible()), "바꾼 뒤에도 그 줄은 숨겨져 있다 (제목이 어긋나 다시 나타나지 않는다)");

// 다른 제목이 있던 글은 이름을 바꿔도 본문을 건드리지 않는다.
await tree.getByRole("button", { name: "다른 글", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "이름 바꾸기" }).click();
await page.getByLabel("다른 글 새 이름").fill("이름만 바꿈");
await page.getByLabel("다른 글 새 이름").press("Enter");
assert(await waitFor(() => fs.existsSync(path.join(ws, "이름만 바꿈.md"))), "다른 글의 이름도 바뀐다");
assert(read("이름만 바꿈.md") === "# 다른 제목\n\n본문\n", "본문 맨 앞 제목이 글 제목과 다르면 본문은 그대로다");

// ── 제목 줄밖에 없는 글: 쓸 자리가 있다 ──
await tree.getByRole("button", { name: "머리만", exact: true }).click();
await page.waitForSelector(".note-prose");
await sleep(500);
assert((await page.locator(".note-prose > p").count()) >= 1, "제목 줄밖에 없는 글에는 쓸 빈 문단이 생긴다");
await page.locator(".note-prose > p").first().click();
await page.keyboard.type("처음 쓴 글");
await sleep(1200);
assert(read("머리만.md").startsWith("# 머리만\n\n처음 쓴 글"), `숨긴 줄이 아니라 새 문단에 쓴다\n${read("머리만.md")}`);

// ── 내보내기: 제목이 두 번 나오지 않는다 ──
await tree.getByRole("button", { name: "새 제목", exact: true }).click();
await page.waitForSelector(".note-prose h2");
const htmlOut = path.join(outDir, "out.html");
await app.evaluate(({ dialog }, f) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
}, htmlOut);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "웹 문서" }).click();
assert(await waitFor(() => fs.existsSync(htmlOut)), "HTML로 내보낸다");
const html = fs.readFileSync(htmlOut, "utf8");
assert((html.match(/새 제목/g) ?? []).length === 2 && html.includes('<h1 class="title">새 제목</h1>') && !/<h1>\s*새 제목/.test(html), "문서 제목은 한 번만 나온다 (<title>과 머리 제목)");
const mdOut = path.join(outDir, "out.md");
await app.evaluate(({ dialog }, f) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: f });
}, mdOut);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "마크다운" }).click();
assert(await waitFor(() => fs.existsSync(mdOut)), "마크다운으로 내보낸다");
assert(fs.readFileSync(mdOut, "utf8").includes("# 새 제목\n"), "마크다운에는 파일 그대로 제목 줄이 있다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
