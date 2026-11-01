// 문장 다듬기 제안(긴 문장)의 "AI로 다듬기"를 실제 앱에서 확인한다. AI는 가짜 claude가 대신한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:polish`
import { createReporter, launchApp } from "./helpers.mjs";

const { assert } = createReporter();
const longSentence = `그는 아침 일찍 집을 나서서 한참을 걸어 도착한 낯선 마을에서 오래전에 헤어졌던 친구를 만났고 두 사람은 한참 동안 말없이 서로를 바라보다가 이윽고 웃음을 터뜨리며 지난 이야기를 나누기 시작했는데 그 사이 해는 어느새 서쪽으로 기울어 저녁이 되돌아 왔다.`;
const env = await launchApp({ open: "긴글", files: { "긴글.md": `# 긴글\n\n앞 문장입니다. ${longSentence} 뒤 문장입니다.\n` } });
const { page, logs, aiCalls } = env;

await page.waitForSelector(".note-prose .style-long");
await page.locator(".note-prose .style-long").first().click();
const popover = page.getByRole("dialog", { name: "문장 다듬기 제안" });
await popover.waitFor();
const button = popover.getByRole("button", { name: "AI로 다듬기" });
assert(await button.isVisible(), "긴 문장 제안에 'AI로 다듬기'가 있다");

await button.click();
const polished = popover.getByTestId("ai-polished");
await polished.waitFor();
const result = (await polished.textContent()) ?? "";
assert(result.includes("저녁이 되돌아왔다.") && !result.includes("\n"), `AI가 다듬은 문장을 한 줄로 미리 보여 준다 (${result.slice(-24)})`);
const call = aiCalls().at(-1);
assert(call?.input.includes("이 문장을 다듬으세요.") && call.input.includes("그는 아침 일찍") && !call.input.includes("앞 문장입니다."), "그 문장만 AI에 보낸다 (앞뒤 문장은 보내지 않는다)");
assert(!(await page.locator(".note-prose").textContent())?.includes("저녁이 되돌아왔다"), "적용하기 전에는 글이 그대로다");

await popover.getByRole("button", { name: "적용", exact: true }).click();
await popover.waitFor({ state: "detached" });
const text = (await page.locator(".note-prose").textContent()) ?? "";
assert(text.includes("앞 문장입니다. 그는 아침 일찍") && text.includes("저녁이 되돌아왔다. 뒤 문장입니다."), "적용하면 그 문장만 바뀌고 앞뒤 글은 그대로다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
