// claude에 로그인되어 있지 않을 때 AI 탭이 연결 방법을 안내하는지 확인한다. 가짜 claude CLI를 쓴다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:ai-login`
import { createReporter, launchApp } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({ open: undefined, files: { "초안.md": "# 제목\n\n본문\n" }, env: { FAKE_CLAUDE_LOGGED_OUT: "1" } });
const { page, logs } = env;

await page.getByRole("tab", { name: "AI" }).click();
const alert = page.getByRole("alert").filter({ hasText: "로그인되어 있지 않아요" });
await alert.waitFor();
const text = await alert.innerText();
assert(text.includes("/login") && text.includes("claude"), "로그인 안내(터미널에서 claude 실행 후 /login)가 나온다");
assert((await alert.getByRole("button", { name: "다시 확인" }).count()) === 1, "다시 확인 버튼이 있다");
assert(await page.getByRole("button", { name: "맞춤법 교정" }).isDisabled(), "로그인 전에는 AI 버튼이 꺼져 있다");
ok("로그인 안내 확인");
assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
