// 목차 패널과 AI 초안 만들기(기본정보 → 목차 → 초안)를 실제 앱에서 확인한다. 가짜 claude CLI를 쓴다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:draft`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({
  open: "긴 글",
  files: { "긴 글.md": `## 첫째 장\n\n${"첫째 장 내용입니다.\n\n".repeat(30)}### 작은 절\n\n작은 절 내용\n\n## 둘째 장\n\n${"둘째 장 내용입니다.\n\n".repeat(30)}` },
});
const { page, ws, aiCalls, logs } = env;
const outline = page.getByRole("navigation", { name: "목차" });
/** 접혀 있을 때 보이는 줄 (지금 보고 있는 제목과 그 위 제목들). 사라지는 중인 줄은 뺀다. */
const collapsed = async () => {
  await sleep(250);
  return (await outline.locator("[data-outline-current] .outline-trail-line:not([data-leaving])").allInnerTexts()).join("\n");
};
const away = () => page.mouse.move(700, 600);
const dialog = page.getByRole("dialog", { name: "AI 초안 만들기" });

// 목차 패널: 평소에는 지금 보고 있는 제목 한 줄만
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("작은 절 내용"));
await away();
assert((await collapsed()) === "첫째 장", `접힌 목차에는 지금 제목 하나만 보인다 (${await collapsed()})`);
assert(!(await outline.getByRole("button", { name: "둘째 장" }).isVisible()), "평소에는 전체 목록이 숨어 있다");

await outline.hover();
assert(await outline.getByRole("button", { name: "둘째 장" }).isVisible(), "마우스를 올리면 전체 목차가 펼쳐진다");
const items = await outline.getByRole("button").allInnerTexts();
assert(JSON.stringify(items) === JSON.stringify(["첫째 장", "작은 절", "둘째 장"]), `목차에 글의 제목이 순서대로 보인다 (${items.join(", ")})`);
await page.screenshot({ path: path.join(OUT, "draft-1-outline-hover.png") });

await outline.getByRole("button", { name: "둘째 장" }).click();
await sleep(700);
const top = await page.evaluate(() => {
  const heading = [...document.querySelectorAll(".note-prose h2")].find((h) => h.textContent === "둘째 장");
  return heading?.getBoundingClientRect().top ?? -1;
});
assert(top >= 0 && top < 120, `목차를 누르면 그 제목이 화면 위쪽으로 온다 (top=${Math.round(top)})`);
await away();
assert((await collapsed()) === "둘째 장", "옮겨 간 제목이 접힌 목차에 보인다");
await page.screenshot({ path: path.join(OUT, "draft-1-outline-collapsed.png") });

await page.locator("[data-note-scroller]").evaluate((el) => el.scrollTo({ top: 0 }));
await sleep(300);
assert((await collapsed()) === "첫째 장", "스크롤하면 접힌 목차가 지금 보이는 제목으로 바뀐다");
await page.locator("[data-note-scroller]").evaluate((el) => {
  const heading = [...document.querySelectorAll(".note-prose h3")].find((h) => h.textContent === "작은 절");
  el.scrollTo({ top: el.scrollTop + heading.getBoundingClientRect().top - el.getBoundingClientRect().top - 40 });
});
await sleep(300);
assert((await collapsed()) === "첫째 장\n작은 절", `하위 제목에 있으면 상위 제목부터 이어서 보인다 (${JSON.stringify(await collapsed())})`);
await page.screenshot({ path: path.join(OUT, "draft-1-outline-trail.png") });
await page.locator("[data-note-scroller]").evaluate((el) => el.scrollTo({ top: 0 }));
await sleep(300);
await outline.focus();
assert(await outline.getByRole("button", { name: "둘째 장" }).isVisible(), "키보드로 들어와도 펼쳐진다");
await outline.getByRole("button", { name: "둘째 장" }).click();
await sleep(500);

await page.keyboard.press("End");
await page.keyboard.type(" 고침");
await sleep(300);
assert((await outline.getByRole("button", { name: "둘째 장 고침" }).count()) === 1, "제목을 고치면 목차도 바로 바뀐다");

await page.getByRole("button", { name: "목차 패널" }).click();
assert((await outline.count()) === 0, "사이드바 버튼으로 목차 패널을 닫을 수 있다");
await page.getByRole("button", { name: "목차 패널" }).click();
assert((await outline.count()) === 1, "다시 열 수 있다");
ok("목차 패널 확인");

// 초안 만들기: AI 탭에서 연다
await page.getByRole("tab", { name: "AI" }).click();
await page.getByRole("button", { name: "기본정보로 목차·초안 만들기" }).click();
await dialog.waitFor();
await dialog.getByRole("button", { name: "목차 만들기" }).click();
assert(await dialog.getByText("주제를 입력해 주세요.").isVisible(), "주제 없이 목차를 만들면 안내가 나온다");

await dialog.getByLabel("주제 또는 제목").fill("달리기 습관");
await dialog.getByRole("radio", { name: "에세이" }).click();
await dialog.getByRole("radio", { name: /^짧게/ }).click();
await dialog.getByPlaceholder("예: 운동을 안 하는 30대 직장인").fill("30대 직장인");
await dialog.getByRole("button", { name: "목차 만들기" }).click();
const outlineBox = dialog.getByLabel("목차 편집");
await page.waitForFunction(() => document.querySelector("[aria-label='목차 편집']")?.value.includes("## 마치며"));
await sleep(200);
const outlineCall = aiCalls().at(-1);
assert(outlineCall.input.includes("- 주제: 달리기 습관") && outlineCall.input.includes("- 글 종류: 에세이") && outlineCall.input.includes("- 독자: 30대 직장인"), "기본정보가 프롬프트에 들어간다");
assert(outlineCall.args[outlineCall.args.indexOf("--tools") + 1] === "", "초안 만들기에서는 도구를 끈다");
assert((await outlineBox.inputValue()).startsWith("## 달리기 습관 시작하기"), "AI가 만든 목차가 편집 칸에 나온다");
await page.screenshot({ path: path.join(OUT, "draft-2-outline.png") });

// 목차를 고치고 초안 쓰기
await outlineBox.fill(`${await outlineBox.inputValue()}\n## 덧붙인 장\n- 직접 넣은 장`);
await dialog.getByRole("button", { name: "이 목차로 초안 쓰기" }).click();
await page.waitForFunction(() => [...document.querySelectorAll("[role='dialog'] button")].some((b) => b.textContent?.includes("새 글로 만들기") && !b.disabled));
const draftCall = aiCalls().at(-1);
assert(draftCall.input.includes("<outline>") && draftCall.input.includes("## 덧붙인 장"), "고친 목차가 초안 요청에 들어간다");
const draftText = await dialog.getByLabel("생성된 초안").innerText();
assert(draftText.includes("덧붙인 장에 대한 초안 문단입니다."), "초안이 목차를 따라 만들어진다");
await page.screenshot({ path: path.join(OUT, "draft-3-draft.png") });

// 새 글로 만들기
await dialog.getByRole("button", { name: "새 글로 만들기" }).click();
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("덧붙인 장에 대한 초안 문단입니다."));
assert((await dialog.count()) === 0, "새 글을 만들면 창이 닫힌다");
const saved = fs.readFileSync(path.join(ws, "달리기 습관.md"), "utf8");
assert(saved.startsWith("## 달리기 습관 시작하기\n\n달리기 습관 시작하기에 대한 초안 문단입니다."), "주제를 제목으로 한 새 글에 초안이 저장된다");
await outline.hover();
const newItems = await outline.getByRole("button").allInnerTexts();
assert(newItems.includes("덧붙인 장") && newItems.includes("준비물"), `새 글의 목차가 목차 패널에 보인다 (${newItems.join(", ")})`);
await page.screenshot({ path: path.join(OUT, "draft-4-new-note.png") });

// 다시 열면 만든 초안과 입력한 기본정보가 남아 있다
await page.getByRole("button", { name: "기본정보로 목차·초안 만들기" }).click();
await dialog.waitFor();
assert((await dialog.getByLabel("생성된 초안").innerText()).includes("덧붙인 장"), "다시 열면 만든 초안이 남아 있다");
await dialog.getByRole("button", { name: "목차", exact: true }).click();
await dialog.getByRole("button", { name: "기본정보", exact: true }).click();
assert((await dialog.getByLabel("주제 또는 제목").inputValue()) === "달리기 습관", "기본정보도 남아 있다");
await page.keyboard.press("Escape");
assert((await dialog.count()) === 0, "Esc로 창을 닫는다");
ok("초안 만들기 확인");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
