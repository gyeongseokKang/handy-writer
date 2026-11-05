// AI 퇴고: 나의 퇴고 룰을 저장하고(접어도 몇 줄인지 보임), 퇴고하면 바뀐 점 diff와 고친 점 목록이 보이며,
// 적용하면 AI의 생각은 빼고 고친 글만 들어가는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:revise`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const env = await launchApp({ open: "초고", files: { "초고.md": "나는 정말 글쓰기가 좋다.\n\n사실 매일 쓴다.\n" } });
const { page, ws, logs } = env;
const read = (p) => fs.readFileSync(path.join(ws, p), "utf8");
const aiLog = () => fs.readFileSync(path.join(env.ud, "fake-claude.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);

await page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: "AI" }).click();
const panel = page.getByRole("region", { name: "AI 도우미" });

// 퇴고 룰: 비어 있으면 기본 기준을 쓴다고 보이고, 적어서 저장하면 파일에 남고 접어도 줄 수와 첫 줄이 보인다
const reviseSummary = panel.locator("summary").filter({ hasText: "나의 퇴고 룰" });
assert((await reviseSummary.innerText()).includes("기본 기준 사용"), "퇴고 룰이 비어 있으면 기본 기준을 쓴다고 보인다");
await reviseSummary.click();
await panel.getByLabel("퇴고 룰", { exact: true }).fill("- 문장은 40자 안으로 줄인다\n- 같은 말은 한 번만");
await panel.locator("details").filter({ hasText: "나의 퇴고 룰" }).getByRole("button", { name: "저장" }).click();
await sleep(400);
assert(read(".handy-writer/revise-rules.md").startsWith("- 문장은 40자 안으로"), "퇴고 룰이 작업 폴더 .handy-writer/revise-rules.md에 저장된다");
await reviseSummary.click();
await sleep(200);
assert((await reviseSummary.innerText()).includes("2줄"), "접어 두어도 몇 줄인지 보인다");
assert((await panel.getByText("문장은 40자 안으로 줄인다 외 1줄").count()) === 1, "접어 두어도 첫 줄이 보인다");

// 퇴고
await page.locator(".note-prose p").first().click();
await panel.getByRole("button", { name: "퇴고", exact: true }).click();
const result = page.getByRole("region", { name: "AI 결과" });
await result.getByText("완료").waitFor({ timeout: 10000 });
assert(aiLog().input.includes("<revise_rules>\n- 문장은 40자 안으로 줄인다"), "저장한 퇴고 룰을 AI에 함께 보낸다");
const notes = result.getByLabel("퇴고에서 고친 점");
assert((await notes.innerText()).includes("군더더기 삭제") && (await notes.innerText()).includes("문장은 40자 안으로"), "고친 점 목록이 보인다");
assert((await result.locator("del").count()) > 0, "바뀐 점이 diff로 보인다");
await page.screenshot({ path: path.join(OUT, "revise.png") });
await result.getByRole("button", { name: "본문 전체에 적용" }).click();
await sleep(1500);
const after = read("초고.md");
assert(after === "나는 글쓰기가 좋다.\n\n매일 쓴다.\n", `적용하면 고친 글만 들어간다 (${JSON.stringify(after)})`);
assert((await panel.getByLabel("지난 AI 결과").getByRole("button", { name: /퇴고/ }).count()) === 1, "퇴고 결과도 지난 결과에 남는다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
