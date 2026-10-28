// 오른쪽 패널의 맞춤법 탭(전체 목록, 고치기, 건너뛰기, 그 자리로 스크롤)과
// 왼쪽 아래 브랜치로 여는 Git 화면을 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:spell-panel`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const filler = Array.from({ length: 30 }, (_, i) => `${i + 1}번째 문단은 맞춤법이 맞는 평범한 글이에요.`).join("\n\n");
const source = `# 맞춤법\n\n어제 그 일이 됬다고 들었다.\n\n${filler}\n\n웬지 마지막 문단이 이상하다.\n\n웬지 한 번 더 나온다.\n`;

const env = await launchApp({ open: "맞춤법", files: { "맞춤법.md": source } });
const { page, ws, logs } = env;
const file = path.join(ws, "맞춤법.md");
const read = () => fs.readFileSync(file, "utf8");

// 온라인 검사는 끄고(규칙 기반만) 다시 연다.
await page.evaluate(() => localStorage.setItem("handy-writer:spellcheck-online", "false"));
await page.reload();
await page.click("nav[aria-label='글 목록'] >> text=맞춤법");
await page.waitForSelector(".note-prose .spell-error");

// --- 맞춤법 탭
const tab = page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: /맞춤법/ });
assert((await tab.innerText()).includes("3"), "맞춤법 탭에 항목 수가 보인다");
await tab.click();
const list = page.getByRole("region", { name: "맞춤법 목록" }).or(page.locator("section[aria-label='맞춤법 목록']"));
const rows = list.locator("li");
await rows.first().waitFor();
assert((await rows.count()) === 3, "이 글의 맞춤법 항목을 모두 보여준다");
assert((await rows.first().innerText()).includes("어제 그 일이"), "항목마다 앞뒤 글을 함께 보여준다");

const scroller = () => page.evaluate(() => {
  const el = document.querySelector(".spell-active");
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { top: rect.top, visible: rect.top > 0 && rect.bottom < window.innerHeight, text: el.textContent };
});

// 아래쪽 항목을 누르면 그 자리로 스크롤하고 강조한다.
await rows.nth(1).locator("button").first().click();
await sleep(700);
const shown = await scroller();
assert(shown?.text === "웬지" && shown.visible, `고른 항목으로 스크롤하고 강조한다 (${JSON.stringify(shown)})`);
await page.screenshot({ path: path.join(OUT, "spell-panel.png") });

// 건너뛰기: 그 자리만 빠지고 다음 항목(같은 낱말의 다른 자리)으로 넘어간다
await rows.nth(1).getByRole("button", { name: "건너뛰기" }).click();
await sleep(700);
assert((await rows.count()) === 2, "건너뛴 항목은 목록에서 빠진다");
assert(read().includes("웬지 마지막"), "건너뛰기는 글을 바꾸지 않는다");
const next = await scroller();
assert(next?.text === "웬지" && next.visible && (await rows.nth(1).getAttribute("aria-current")) === "true", "건너뛰면 다음 항목으로 넘어가 스크롤한다");

// 고치기
await rows.first().getByRole("button", { name: "고치기" }).click();
await sleep(1200);
assert(read().includes("됐다고 들었다") && !read().includes("됬다고"), "고치기를 누르면 글이 고쳐지고 저장된다");
assert((await rows.count()) === 1, "고친 항목은 목록에서 빠진다");
await rows.first().getByRole("button", { name: "고치기" }).click();
await sleep(1200);
assert(read().includes("왠지 한 번 더") && read().includes("웬지 마지막"), "남은 항목도 고치고, 건너뛴 자리는 그대로 둔다");
assert(await page.getByText("고칠 곳이 없어요.").isVisible(), "다 고치면 고칠 곳이 없다고 알려 준다");
ok("맞춤법 탭 확인");

// --- Git: 탭에서 빠지고, 왼쪽 아래 버튼으로 연다
assert((await page.getByRole("tab", { name: "Git" }).count()) === 0, "오른쪽 패널 탭에 Git이 없다");
const gitButton = page.getByRole("button", { name: "Git 상태" });
assert((await gitButton.innerText()).includes("Git 시작하기"), "저장소가 아닌 폴더에서는 왼쪽 아래에 Git 시작하기가 보인다");
await gitButton.click();
const gitView = page.getByRole("complementary", { name: "Git" });
await gitView.waitFor();
assert((await page.getByRole("tablist", { name: "패널 보기" }).count()) === 0, "왼쪽 아래 버튼을 누르면 탭 대신 Git 화면이 보인다");
await gitView.getByRole("button", { name: "git 저장소 만들기" }).click();
await page.waitForFunction(() => /main|master/.test(document.querySelector("button[aria-label='Git 상태']")?.textContent ?? ""), null, { timeout: 8000 });
assert(fs.existsSync(path.join(ws, ".git")), "Git 화면에서 저장소를 만들면 왼쪽 아래에 브랜치가 보인다");
await page.screenshot({ path: path.join(OUT, "git-view.png") });
await page.getByRole("button", { name: "Git 닫기" }).click();
await page.getByRole("tablist", { name: "패널 보기" }).waitFor();
assert((await page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: /맞춤법/ }).getAttribute("aria-selected")) === "true", "X를 누르면 보던 탭으로 돌아간다");
await gitButton.click();
await gitView.waitFor();
await gitButton.click();
assert((await gitView.count()) === 0, "브랜치를 다시 누르면 Git 화면을 닫는다");
ok("Git 화면 확인");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
