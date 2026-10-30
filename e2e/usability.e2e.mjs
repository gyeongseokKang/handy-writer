// 사용성 개선을 실제 앱에서 확인한다: 시작 안내, 명령 팔레트(>), 단축키 안내, 설정, 제목 중복 흐리기,
// 제목 아래 태그, 닫은 탭 다시 열기, 좁은 창에서 오른쪽 패널 접기, 목차 아이콘으로 줄이기.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:usability`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const files = {
  "달리기.md": "# 달리기\n\n## 준비\n\n장거리 훈련과 페이스 조절, 스트레칭.\n",
  "운동 일지.md": "---\ntags: [운동]\n---\n\n아침 달리기와 스트레칭, 페이스 조절.\n",
  "메모.md": "그냥 메모.\n",
};
const env = await launchApp({ files, onboarding: true });
const { page, ws, logs } = env;
const read = (name) => fs.readFileSync(path.join(ws, name), "utf8");
const mod = "Control";

// ── 시작 안내 ──
const tour = page.getByRole("dialog", { name: "Handy Writer 시작 안내" });
await tour.waitFor({ timeout: 5000 });
assert(true, "처음 실행하면 시작 안내가 뜬다");
for (let i = 0; i < 3; i++) await tour.getByRole("button", { name: /다음/ }).click();
assert((await tour.innerText()).includes("4 / 4"), "다음으로 끝까지 넘긴다");
await tour.getByRole("button", { name: "시작하기" }).click();
await page.reload();
await page.waitForSelector("nav[aria-label='글 목록']");
await sleep(800);
assert((await tour.count()) === 0, "한 번 본 뒤에는 다시 뜨지 않는다");

await page.click("nav[aria-label='글 목록'] >> text=달리기");
await page.waitForSelector(".note-prose");

// ── 제목 중복 흐리기 ──
const h1 = page.locator(".note-prose > h1").first();
assert((await h1.getAttribute("class"))?.includes("title-echo"), "본문 첫 제목이 글 제목과 같으면 흐리게 줄인다");
assert(read("달리기.md").startsWith("# 달리기\n"), "파일은 그대로다");

// ── 명령 팔레트 ──
await page.keyboard.press(`${mod}+k`);
const palette = page.getByRole("dialog", { name: /글 검색|명령 실행/ });
await palette.getByLabel("검색어").fill(">찾기");
const options = palette.getByRole("option");
assert((await options.first().innerText()).includes("글 안에서 찾기"), "> 뒤에 이름을 쓰면 명령을 찾는다");
assert((await options.first().innerText()).includes("Ctrl+F"), "명령 옆에 단축키가 보인다");
await page.keyboard.press("Enter");
await page.getByRole("search", { name: "글 안에서 찾기" }).waitFor({ timeout: 3000 });
assert(true, "명령을 고르면 실행된다 (찾기 열림)");
await page.keyboard.press("Escape");
await page.keyboard.press(`${mod}+Shift+P`);
assert((await page.getByLabel("검색어").inputValue()) === ">", "Ctrl+Shift+P는 명령 모드로 연다");
await page.screenshot({ path: path.join(OUT, "command-palette.png") });
await page.keyboard.press("Escape");

// ── 단축키 안내와 설정 ──
await page.keyboard.press(`${mod}+/`);
const shortcuts = page.getByRole("dialog", { name: "단축키" });
await shortcuts.waitFor();
const text = await shortcuts.innerText();
assert(text.includes("변경 기록 보기") && text.includes("Ctrl+Shift+H") && text.includes("닫은 탭 다시 열기"), "Ctrl+/는 단축키 안내를 연다");
await page.keyboard.press("Escape");
assert((await shortcuts.count()) === 0, "Esc로 닫는다");

await page.keyboard.press(`${mod}+,`);
const settings = page.getByRole("dialog", { name: "설정" });
await settings.waitFor();
await page.screenshot({ path: path.join(OUT, "settings.png") });
await settings.getByLabel("목차 띄우기").uncheck();
assert((await page.getByRole("navigation", { name: "목차" }).count()) === 0, "설정에서 목차를 끈다");
await settings.getByLabel("목차 띄우기").check();
await settings.getByRole("button", { name: /다듬기 규칙/ }).click();
assert(await page.getByRole("dialog", { name: "문장 다듬기 설정" }).isVisible(), "설정에서 문장 다듬기 설정으로 이어진다");
await page.keyboard.press("Escape");

// ── 제목 아래 태그 ──
const tagRow = page.getByRole("group", { name: "이 글의 태그" });
await tagRow.getByRole("button", { name: "태그", exact: true }).click();
const chips = tagRow.getByLabel("추천 태그").getByRole("button");
await chips.first().waitFor({ timeout: 10000 });
assert((await chips.first().innerText()).trim() === "운동", "제목 아래 + 태그도 기존 태그를 추천한다");
await chips.first().click();
await sleep(1200);
assert(read("달리기.md").startsWith("---\ntags:\n  - 운동\n---\n"), "추천 태그를 누르면 frontmatter에 들어간다");
assert(await tagRow.getByRole("button", { name: "운동", exact: true }).isVisible(), "제목 아래에 태그가 바로 보인다");
await page.screenshot({ path: path.join(OUT, "title-tags.png") });

// ── 닫은 탭 다시 열기 ──
const tabs = page.getByRole("tablist", { name: "열린 글" });
await page.locator("nav[aria-label='글 목록']").getByText("메모", { exact: true }).click({ modifiers: ["Control"] });
await sleep(300);
await tabs.getByRole("button", { name: "메모 탭 닫기" }).click();
await sleep(300);
assert(!(await tabs.innerText()).includes("메모"), "탭을 닫는다");
await page.keyboard.press(`${mod}+Shift+T`);
await sleep(400);
assert((await tabs.getByRole("tab", { selected: true }).innerText()).trim() === "메모", "Ctrl+Shift+T로 닫은 탭을 다시 연다");

// ── 좁은 창에서 오른쪽 패널 접기 ──
const rightTabs = page.getByRole("tablist", { name: "패널 보기" });
await page.setViewportSize({ width: 900, height: 820 });
await sleep(400);
assert((await rightTabs.count()) === 0, "창이 좁으면 오른쪽 패널을 저절로 접는다");
await page.setViewportSize({ width: 1280, height: 820 });
await sleep(400);
assert((await rightTabs.count()) === 1, "다시 넓어지면 펼친다");

// ── 목차: 글 칸 왼쪽에 자리가 없으면 아이콘만 ──
const outline = page.getByRole("navigation", { name: "목차" });
assert((await outline.getAttribute("data-compact")) === "true", "글 칸 옆에 자리가 없으면 목차를 아이콘으로 줄인다");
await page.setViewportSize({ width: 2000, height: 900 });
await sleep(500);
assert((await outline.getAttribute("data-compact")) === null, "자리가 넉넉하면 지금 제목까지 보여 준다");
await page.setViewportSize({ width: 1280, height: 820 });

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
