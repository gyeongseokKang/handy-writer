// 상태 막대의 오류 로그 창을 실제 앱에서 확인한다. 가짜 claude CLI를 쓴다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:log`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({ open: "초안", files: { "초안.md": "본문입니다.\n" } });
const { page, ud } = env;
const indicator = page.getByRole("button", { name: "오류 로그" });
const panel = page.getByRole("region", { name: "오류 로그 창" });

await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("본문입니다"));
assert((await indicator.count()) === 0, "오류가 없으면 상태 막대에 로그 표시가 없다");

// 메인에서 난 오류 (AI 실패)
await page.getByRole("tab", { name: "AI" }).click();
await page.fill("textarea[aria-label='추가 요청']", "FAIL");
await page.getByRole("button", { name: "지시대로 처리" }).click();
await indicator.waitFor();
assert((await indicator.innerText()).trim() === "1", "AI 오류가 나면 상태 막대에 새 오류 1이 보인다");
assert((await indicator.getAttribute("class")).includes("text-destructive"), "새 오류는 빨갛게 보인다");

// 사용자가 멈춘 것은 오류가 아니다
await page.getByRole("button", { name: "닫기", exact: true }).click();
await page.fill("textarea[aria-label='추가 요청']", "SLOW");
await page.getByRole("button", { name: "다듬기" }).click();
await page.getByRole("button", { name: "중지" }).click();
await page.waitForSelector("[aria-label='AI 결과'] [role='alert']:has-text('취소')");
await sleep(300);
assert((await indicator.innerText()).trim() === "1", "AI를 직접 멈춘 것은 오류로 남기지 않는다");
await page.getByRole("button", { name: "닫기", exact: true }).click();

// 화면에서 난 오류 (알림)
await page.fill("textarea[aria-label='추가 요청']", "");
await page.getByRole("button", { name: "지시대로 처리" }).click();
await page.waitForFunction(() => document.querySelector("[aria-label='오류 로그']")?.textContent?.trim() === "2");
ok("화면의 오류 알림도 로그에 모인다");

await indicator.click();
await panel.waitFor();
const rows = await panel.locator("li").allInnerTexts();
assert(rows.length === 2, `로그 창에 기록이 두 개 있다 (${rows.length})`);
assert(rows[0].includes("화면") && rows[0].includes("지시를 입력해 주세요"), "최근 기록이 위에 오고, 어디서 났는지 보인다");
assert(rows[1].includes("AI") && rows[1].includes("로그인이 필요해요"), "AI 오류에는 AI 출처가 붙는다");
assert(!(await indicator.getAttribute("class")).includes("text-destructive"), "로그 창을 열면 새 오류 표시가 꺼진다");
await page.screenshot({ path: path.join(OUT, "log-panel.png") });

const logFile = path.join(ud, "logs", "main.log");
await sleep(300);
const fileText = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
assert(fileText.includes("[ERROR] [AI]") && fileText.includes("[ERROR] [화면]"), "로그 파일에도 남는다");

await page.keyboard.press("Escape");
assert((await panel.count()) === 0, "Esc로 로그 창을 닫는다");
await indicator.click();
await panel.getByRole("button", { name: "지우기" }).click();
assert(await panel.getByText("기록된 오류가 없어요.").isVisible(), "지우면 비어 있다고 알려준다");
await panel.getByRole("button", { name: "로그 창 닫기" }).click();
assert((await indicator.count()) === 0, "지우고 닫으면 상태 막대의 표시도 사라진다");
ok("오류 로그 확인");

await env.close();
