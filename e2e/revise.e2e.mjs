// AI 퇴고: 나의 퇴고 룰을 저장하고(접어도 몇 줄인지 보임), 퇴고하면 바뀐 점 diff와 고친 점 목록이 보이며,
// 적용하면 AI의 생각은 빼고 고친 글만 들어가는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:revise`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const env = await launchApp({ open: "초고", files: { "초고.md": "## 첫째\n\n나는 정말 글쓰기가 좋다.\n\n## 둘째\n\n사실 매일 쓴다.\n" } });
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
// 결과는 사이드 패널이 아니라 본문 자리에 변경 기록처럼 크게 뜬다. 먼저 퇴고할 부분을 고른다(처음엔 모두).
const view = page.getByRole("dialog", { name: "퇴고 결과" });
const parts = view.getByRole("list", { name: "퇴고할 부분" }).getByRole("checkbox");
assert((await parts.count()) === 2 && (await parts.nth(1).isChecked()), "제목마다 퇴고할 부분을 고를 수 있고 처음엔 모두 골라져 있다");
await page.screenshot({ path: path.join(OUT, "revise-setup.png") });
await view.getByRole("button", { name: "전체 퇴고" }).click();
// 진행 중에는 지금 어느 단계인지와 걸린 시간을 보여 준다
const progress = view.getByLabel("퇴고 진행");
await progress.waitFor({ timeout: 5000 });
assert((await progress.locator('[aria-current="step"]').innerText()).includes("글을 읽고 고칠 곳 찾기"), "처음엔 글을 읽는 단계라고 보인다");
await page.screenshot({ path: path.join(OUT, "revise-progress.png") });
await view.getByRole("button", { name: /에 적용/ }).waitFor({ timeout: 10000 });
assert(aiLog().input.includes("<revise_rules>\n- 문장은 40자 안으로 줄인다"), "저장한 퇴고 룰을 AI에 함께 보낸다");
const notes = view.getByLabel("퇴고에서 고친 점");
assert((await notes.locator("del").first().innerText()) === "정말 글쓰기가" && (await notes.locator("ins").first().innerText()) === "글쓰기가", "고친 점이 원문 → 수정으로 보인다");
assert((await notes.innerText()).includes("군더더기 '정말'을 뺌") && (await notes.innerText()).includes("문장은 40자 안으로"), "고친 이유도 보인다");
const suggestions = view.getByLabel("퇴고 제안");
assert((await suggestions.innerText()).includes("둘째 절이 짧으니 첫 절과 합치기") && (await suggestions.innerText()).includes("적용 안 함"), "제안은 적용하지 않고 따로 보인다");
const toc = view.getByLabel("수정 전·후 목차");
assert((await toc.innerText()).includes("둘째") && (await toc.innerText()).includes("둘째: 매일 쓰는 이유"), "수정 전·후 목차가 나란히 보인다");
assert((await view.locator("del").count()) > 0, "본문 자리에 바뀐 점이 diff로 보인다");
assert(/\+\d+자/.test(await view.locator("header").innerText()) && /−\d+자/.test(await view.locator("header").innerText()), "늘고 준 글자 수가 보인다");
assert((await panel.getByRole("region", { name: "AI 결과", exact: true }).innerText()).includes("본문 화면에서"), "사이드 패널에는 본문 화면에서 보라는 안내만 남는다");
await page.screenshot({ path: path.join(OUT, "revise.png") });
// 고친 점 카드: 눌러서 넣기·빼기, 누르면 본문의 그 자리로 가서 강조
const card2 = view.getByRole("listitem", { name: "고친 점 2" });
const card2Switch = card2.getByRole("switch");
assert((await card2Switch.getAttribute("aria-checked")) === "true" && (await card2Switch.innerText()) === "적용", "카드마다 적용·제외 스위치가 있고 처음엔 적용");
await card2Switch.click();
const sasil = view.getByLabel("고를 수 있는 바뀐 점").getByRole("checkbox", { name: /사실/ });
assert((await sasil.getAttribute("aria-checked")) === "false" && (await card2Switch.innerText()) === "제외", "카드에서 제외하면 본문의 그 수정도 빠진다");
await card2Switch.click();
assert((await sasil.getAttribute("aria-checked")) === "true", "다시 누르면 넣는다");
await view.getByRole("listitem", { name: "고친 점 1" }).click();
await sleep(200);
const jungmal = view.getByLabel("고를 수 있는 바뀐 점").getByRole("checkbox", { name: /정말/ });
assert((await jungmal.getAttribute("class")).includes("ring-amber-400"), "카드를 누르면 본문의 그 수정이 강조된다");
await page.screenshot({ path: path.join(OUT, "revise-cards.png") });

// 수정마다 적용·빼기를 고른다: 첫 수정('정말' 빼기)을 빼고 나머지만 적용
const changes = view.getByLabel("고를 수 있는 바뀐 점").getByRole("checkbox");
const total = await changes.count();
assert(total >= 3 && (await view.getByLabel("적용할 수정").innerText()) === `수정 ${total}/${total}개 적용`, `수정마다 고를 수 있고 처음엔 모두 적용 (${total}개)`);
await changes.first().click();
assert((await changes.first().getAttribute("aria-checked")) === "false" && (await view.getByLabel("적용할 수정").innerText()) === `수정 ${total - 1}/${total}개 적용`, "누르면 그 수정을 뺀다");
await page.screenshot({ path: path.join(OUT, "revise-pick.png") });
await view.getByRole("button", { name: /고른 \d+개만 본문 전체에 적용/ }).click();
await sleep(1500);
assert((await view.count()) === 0, "적용하면 퇴고 화면이 닫힌다");
const after = read("초고.md");
assert(after === "## 첫째\n\n나는 정말 글쓰기가 좋다.\n\n## 둘째: 매일 쓰는 이유\n\n매일 쓴다.\n", `고른 수정만 들어가고 뺀 곳은 원문 그대로다 (${JSON.stringify(after)})`);
assert((await panel.getByLabel("지난 AI 결과").getByRole("button", { name: /퇴고/ }).count()) === 1, "퇴고 결과도 지난 결과에 남는다");

// 이 글의 퇴고 룰: 퇴고 버튼에 올리면 왼쪽에 +가 나타나고, 적은 룰은 글 속성에 남고 공통 룰과 함께 보낸다
const reviseButton = panel.getByRole("button", { name: /^퇴고/ }).first();
const plus = panel.getByRole("button", { name: "이 글의 퇴고 룰" });
assert((await plus.evaluate((el) => getComputedStyle(el).opacity)) === "0", "평소에는 +가 숨어 있다");
await reviseButton.hover();
await sleep(300);
assert((await plus.evaluate((el) => getComputedStyle(el).opacity)) === "1", "퇴고 버튼에 올리면 왼쪽에 +가 나타난다");
await plus.click();
const noteRules = page.getByRole("dialog", { name: "이 글의 퇴고 룰" });
await noteRules.getByLabel("이 글의 퇴고 룰 내용").fill("- 이 글은 소제목을 질문형으로\n- 2장은 줄이지 않는다");
await page.screenshot({ path: path.join(OUT, "note-revise-rules.png") });
await noteRules.getByRole("button", { name: "퇴고" }).click();
await page.getByRole("dialog", { name: "퇴고 결과" }).getByRole("button", { name: "전체 퇴고" }).click();
await page.getByRole("dialog", { name: "퇴고 결과" }).getByRole("button", { name: /에 적용/ }).waitFor({ timeout: 10000 });
const call = aiLog();
assert(call.input.includes("<revise_rules>\n- 문장은 40자 안으로") && call.input.includes("<note_revise_rules>\n- 이 글은 소제목을 질문형으로\n- 2장은 줄이지 않는다\n</note_revise_rules>"), "공통 퇴고 룰과 이 글의 퇴고 룰을 함께 보낸다");
await page.keyboard.press("Escape");
await sleep(1500);
assert(/revise_rules: \|-?\n {2}- 이 글은 소제목을 질문형으로/.test(read("초고.md")), `이 글의 퇴고 룰이 글 속성에 저장된다 (${JSON.stringify(read("초고.md").slice(0, 80))})`);
assert((await reviseButton.innerText()).includes("+2") && (await plus.evaluate((el) => getComputedStyle(el).opacity)) === "1", "룰이 있으면 +가 늘 보이고 퇴고 버튼에 줄 수가 보인다");

// 고른 부분만 퇴고: 둘째 절을 빼고 첫째 절만 보내고, 결과는 원문 자리에 끼워 넣는다
await page.locator(".note-prose p").first().click();
await reviseButton.click();
const partView = page.getByRole("dialog", { name: "퇴고 결과" });
await partView.getByRole("checkbox", { name: /둘째.*퇴고하기/ }).click();
assert((await partView.getByRole("button", { name: "고른 1곳 퇴고" }).count()) === 1, "고른 곳 수가 버튼에 보인다");
await partView.getByLabel("퇴고 추가 요청").fill("도입은 더 짧게");
await partView.getByRole("button", { name: "고른 1곳 퇴고" }).click();
await partView.getByRole("progressbar", { name: "고친 글 쓰기" }).waitFor({ timeout: 5000 });
assert(true, "고친 글을 쓰는 동안 얼마나 썼는지 막대로 보인다");
await partView.getByRole("button", { name: /에 적용/ }).waitFor({ timeout: 10000 });
const partCall = aiLog();
assert(partCall.input.includes("추가 요청: 도입은 더 짧게"), "고르는 화면에서 적은 추가 요청을 함께 보낸다");
assert(partCall.input.includes('<part n="1">\n## 첫째\n\n나는 정말 글쓰기가 좋다.\n</part>') && !partCall.input.includes("매일 쓴다"), "고른 부분만 part로 감싸 보낸다");
await partView.getByRole("button", { name: /에 적용/ }).click();
await sleep(1500);
const partAfter = read("초고.md");
assert(partAfter.includes("## 첫째\n\n나는 글쓰기가 좋다.\n\n## 둘째: 매일 쓰는 이유\n\n매일 쓴다.\n"), `고친 부분만 원문 자리에 들어가고 나머지는 그대로다 (${JSON.stringify(partAfter)})`);

// 글을 선택하면 뜨는 막대에서 수정하기·퇴고하기를 고르고, 한 줄 추가 요청과 함께 바로 그 부분만 고친다
const selectPara = async () => {
  await page.locator(".note-prose p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await sleep(500);
};
await selectPara();
const bubbleRevise = page.getByRole("button", { name: "퇴고하기" });
await bubbleRevise.click();
const aiBox = page.getByRole("dialog", { name: "선택한 부분 AI로 고치기" });
assert((await aiBox.getByRole("radio", { name: "퇴고하기" }).getAttribute("aria-checked")) === "true", "선택 막대의 퇴고를 누르면 퇴고하기가 골라진 창이 열린다");
await page.screenshot({ path: path.join(OUT, "bubble-ai.png") });
await aiBox.getByLabel("추가 요청").fill("더 담백하게");
await aiBox.getByLabel("추가 요청").press("Enter");
const selView = page.getByRole("dialog", { name: "퇴고 결과" });
await selView.getByRole("button", { name: /선택 부분에 적용/ }).waitFor({ timeout: 10000 });
const selCall = aiLog();
assert(selCall.input.includes("<revise_rules>") && selCall.input.includes("추가 요청: 더 담백하게") && !selCall.input.includes("매일 쓴다"), "선택한 부분만 퇴고 룰과 추가 요청을 함께 보내고, 고르는 화면 없이 바로 시작한다");
await page.keyboard.press("Escape");
await sleep(500);
await selectPara();
await page.getByRole("button", { name: "퇴고하기" }).click({ timeout: 5000 });
await aiBox.getByRole("radio", { name: "수정하기" }).click();
await aiBox.getByLabel("추가 요청").fill("존댓말로");
await aiBox.getByRole("button", { name: "수정하기 시작" }).click();
await page.getByRole("dialog", { name: /다듬기 결과/ }).getByRole("button", { name: /에 적용/ }).waitFor({ timeout: 10000 });
const fixCall = aiLog();
assert(!fixCall.input.includes("<revise_rules>") && fixCall.input.includes("추가 요청: 존댓말로") && fixCall.input.includes("글쓰기 룰에 맞게"), "수정하기는 글쓰기 룰대로 고치고 추가 요청을 함께 보낸다");
await page.keyboard.press("Escape");
await sleep(300);

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
