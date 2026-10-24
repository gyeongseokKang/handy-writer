// 템플릿 블록(앱 전용 블록)을 실제 앱에서 확인한다. 가짜 claude CLI를 쓰므로 네트워크가 필요 없다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:templates`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({
  open: "초안",
  files: {
    "초안.md": "# 제목\n\n도입 문단\n\n## 양자 얽힘\n\n양자 얽힘은 두 입자가 서로 연결되어 있다는 개념입니다.\n\n둘째 문단입니다.\n\n## 다음 절\n\n다음 절 내용\n",
    "참고 자료.md": "참고 자료의 핵심 내용",
  },
});
const { page, ws, aiCalls, logs } = env;
page.on("dialog", (dialog) => void dialog.accept());

// 글 내용은 비동기로 불러오므로, 뜨기 전에 클릭하면 커서가 엉뚱한 곳에 간다.
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("다음 절 내용"));

const file = (name) => fs.readFileSync(path.join(ws, name), "utf8");
const draft = () => file("초안.md");
const dialog = page.locator("[role='dialog'][aria-modal='true']");
const lastCall = () => aiCalls().at(-1);
const toolsOf = (call) => call.args[call.args.indexOf("--tools") + 1];

async function placeCursor(text) {
  // 처음 누르면 에디터가 포커스를 받는 순간 ProseMirror 선택이 이전 위치로 남을 수 있어, 포커스된 뒤 한 번 더 누른다.
  const paragraph = page.locator(".note-prose p", { hasText: text }).first();
  await paragraph.click();
  await sleep(150);
  await paragraph.click();
  await page.keyboard.press("End");
}

// 1) AI 탭의 템플릿 목록
await page.getByRole("tab", { name: "AI" }).click();
await page.waitForSelector("ul[aria-label='템플릿 목록'] > li");
const names = await page.locator("ul[aria-label='템플릿 목록'] > li").evaluateAll((els) => els.map((e) => e.getAttribute("data-template-id")));
assert(["more-info", "tip", "glossary", "summary", "questions"].every((id) => names.includes(id)), `내장 템플릿 5개가 목록에 있다 (${names.join(", ")})`);
await page.getByRole("tab", { name: "연결" }).click();

// 2) 슬래시 메뉴에서 템플릿을 불러 입력 창을 연다
await placeCursor("둘째 문단입니다");
await page.keyboard.press("Enter");
await page.keyboard.type("/ 구분");
await sleep(300);
assert((await page.locator("[role='listbox']").count()) === 0, "슬래시 바로 뒤에 공백이 오면 메뉴가 뜨지 않는다");
await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.keyboard.type("/더 알");
await page.waitForSelector("[role='listbox'] [role='option']:has-text('더 알아보기')");
assert((await page.locator("[role='option']").first().innerText()).includes("템플릿 블록"), "슬래시 메뉴에 템플릿이 '템플릿 블록'으로 나온다");
await page.keyboard.press("Enter");
await dialog.waitFor();
assert((await dialog.innerText()).includes("더 알아보기"), "템플릿을 고르면 입력 창이 열린다");
const depth = dialog.getByRole("radiogroup", { name: "분량" });
assert((await depth.getByRole("radio").allInnerTexts()).join("|") === "약 200자|약 400자|약 800자", "select 필드는 글자 수 버튼 그룹으로 보인다");
assert((await depth.getByRole("radio", { name: "약 400자" }).getAttribute("aria-checked")) === "true", "기본값(약 400자)이 선택돼 있다");
assert((await dialog.getByLabel("참고할 본문").inputValue()) === "section", "참고할 본문의 기본값은 템플릿에 정한 범위(현재 섹션)다");
assert(await dialog.getByRole("checkbox", { name: /웹 검색 사용/ }).isChecked(), "웹 검색은 템플릿의 기본값(켜짐)으로 시작한다");
assert((await page.locator(".note-prose").innerText()).includes("둘째 문단입니다") && !(await page.locator(".note-prose").innerText()).includes("/더"), "입력 창을 열면 슬래시로 친 글자는 지워진다");

// 3) 생성: 입력값이 지침에 들어가고, 현재 섹션만 맥락으로 가고, 웹 검색 도구가 허용된다
await dialog.getByLabel("주제").fill("얽힘의 역사");
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("[role='status']:has-text('웹 검색 중')", { timeout: 8000 });
ok("웹 검색을 쓰는 동안 '웹 검색 중…'이 보인다");
await page.waitForSelector("[aria-label='생성된 내용']:has-text('출처')", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("[role='dialog'] [role='status']")?.textContent?.includes("직접 확인"));
const first = lastCall();
assert(toolsOf(first) === "WebSearch,WebFetch" && first.args.includes("--allowedTools"), "웹 검색을 켠 요청은 WebSearch와 WebFetch만 허용한다");
assert(first.input.includes("지침:\n독자가 본문을 읽다가 더 궁금해할 만한 내용을 얽힘의 역사을(를) 중심으로 설명해 주세요. 분량은 약 400자 정도로 쓰세요."), "입력값이 사전 프롬프트의 {{키}} 자리에 들어간다");
assert(first.input.includes("양자 얽힘은 두 입자가") && first.input.includes("둘째 문단입니다") && !first.input.includes("다음 절 내용") && !first.input.includes("도입 문단"), `현재 섹션(소제목부터 다음 소제목 전까지)만 본문 맥락으로 보낸다 ${JSON.stringify(first.input.match(/<context>\n([\s\S]*?)\n<\/context>/)?.[1])}`);
const previewText = await page.locator("[aria-label='생성된 내용']").innerText();
assert(previewText.startsWith("**독자가 본문을 읽다가") && !previewText.includes("검색해 볼게요"), "도구를 쓰기 전의 중간 발화는 지워지고 최종 답만 미리보기에 남는다");
await page.screenshot({ path: path.join(OUT, "17-template-run.png") });

// 4) 삽입: 앱 전용 블록으로 들어가고, 파일에는 메타데이터가 달린 콜아웃으로 저장된다
await dialog.getByRole("button", { name: "삽입" }).click();
await dialog.waitFor({ state: "detached" });
await page.waitForSelector(".note-prose .template-block");
assert((await page.locator(".template-block-title").innerText()) === "더 알아보기" && (await page.locator(".template-block").getAttribute("data-style")) === "tip", "삽입하면 제목과 모양이 있는 템플릿 블록이 된다");
await sleep(1500);
const saved = draft();
const metaLine = saved.split("\n").find((line) => line.startsWith("> [!tip] 더 알아보기"));
assert(Boolean(metaLine) && metaLine.includes('<!--hw-template {"id":"more-info","inputs":{"topic":"얽힘의 역사","depth":"약 400자"},"extra":"","web":true,"scope":"section"}-->'), `파일에는 입력값 메타데이터가 달린 콜아웃으로 저장된다 (${metaLine?.slice(0, 80)})`);
assert(saved.indexOf("둘째 문단입니다.") < saved.indexOf("[!tip]") && saved.indexOf("[!tip]") < saved.indexOf("## 다음 절"), `블록은 커서가 있던 문단 바로 아래, 다음 소제목 앞에 들어간다 ${JSON.stringify(saved)}`);
assert(saved.includes("> 출처: [예시 문서](https://example.com/doc)"), "AI가 쓴 마크다운(링크 포함)이 블록 안 내용으로 저장된다");

// 5) 다시 생성: 같은 입력값이 채워진 채 열리고, 교체하면 같은 자리에서 내용만 바뀐다
await page.locator(".template-block").hover();
await page.getByRole("button", { name: "다시 생성" }).click();
await dialog.waitFor();
assert((await dialog.getByLabel("주제").inputValue()) === "얽힘의 역사", "다시 생성할 때 저장해 둔 입력값이 채워진다");
await dialog.getByLabel("주제").fill("얽힘의 응용");
await dialog.getByLabel("추가 요청").fill("예시를 포함해 주세요");
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("[aria-label='생성된 내용']:has-text('얽힘의 응용')", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("[role='dialog'] [role='status']")?.textContent?.includes("직접 확인"));
assert(lastCall().input.includes("추가 요청: 예시를 포함해 주세요"), "추가 요청이 AI에 전달된다");
await dialog.getByRole("button", { name: "교체" }).click();
await dialog.waitFor({ state: "detached" });
await sleep(1500);
assert((await page.locator(".template-block").count()) === 1 && draft().includes('"topic":"얽힘의 응용"') && !draft().includes("얽힘의 역사") && draft().includes('"extra":"예시를 포함해 주세요"'), "교체하면 블록은 하나로 유지되고 입력값과 내용이 새것으로 바뀐다");

// 6) 웹 검색을 끄면 도구가 모두 꺼지고, 그렇다고 AI에 알린다
await placeCursor("다음 절 내용");
await page.getByRole("tab", { name: "AI" }).click();
await page.getByRole("button", { name: "더 알아보기 사용" }).click();
await dialog.waitFor();
await dialog.getByRole("checkbox", { name: /웹 검색 사용/ }).uncheck();
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("[aria-label='생성된 내용']:has-text('웹 검색: 안 함')", { timeout: 15000 });
assert(toolsOf(lastCall()) === "" && lastCall().input.includes("웹 검색은 쓰지 않습니다"), "웹 검색을 끄면 모든 도구를 끄고 그렇게 알린다");
assert(lastCall().input.includes("지침:\n본문에서 알맞은 주제를 고르세요") === false && lastCall().input.includes("(비어 있음: 본문 맥락에서 알맞게 정하세요)"), "비워 둔 입력값은 AI가 본문에서 정하도록 안내한다");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "detached" });
assert((await page.locator(".template-block").count()) === 1, "Esc로 닫으면 삽입하지 않는다");

// 7) 필수 필드 검증과 선택한 글의 기본값 채우기
// 문단 맨 앞 다섯 글자("양자 얽힘")를 선택한다. 선택이 에디터에 반영될 때까지 기다린다.
await page.evaluate(() => {
  const p = [...document.querySelectorAll(".note-prose p")].find((el) => el.textContent?.startsWith("양자 얽힘은 두 입자가"));
  const text = p.firstChild;
  document.querySelector(".ProseMirror").focus();
  getSelection().setBaseAndExtent(text, 0, text, 5);
});
await page.waitForFunction(() => getSelection()?.toString() === "양자 얽힘");
await sleep(300);
await page.getByRole("button", { name: "용어 풀이 사용" }).click();
await dialog.waitFor();
const prefilled = await dialog.getByLabel(/용어/).inputValue();
assert(prefilled === "양자 얽힘", `글을 선택하고 템플릿을 부르면 선택한 글이 첫 입력칸의 기본값이다 (${JSON.stringify(prefilled)} / 선택: ${JSON.stringify(await page.evaluate(() => getSelection()?.toString()))})`);
await dialog.getByLabel(/용어/).fill("");
const before = aiCalls().length;
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("text=용어을(를) 입력해 주세요.");
assert(aiCalls().length === before && (await dialog.getByLabel(/용어/).getAttribute("aria-invalid")) === "true", "필수값이 비어 있으면 AI를 부르지 않고 오류를 보여준다");
await dialog.getByLabel(/용어/).fill("얽힘");
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("[aria-label='생성된 내용']:has-text('얽힘')", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("[role='dialog'] [role='status']")?.textContent?.includes("직접 확인"));
await dialog.getByRole("button", { name: "삽입" }).click();
await dialog.waitFor({ state: "detached" });
await page.waitForFunction(() => document.querySelectorAll(".template-block").length === 2);
ok("필수값을 채우면 생성하고 두 번째 블록으로 삽입된다");

// 8) 참고 글 기반 템플릿은 웹 검색 없이 본문만 쓴다고 알린다
await page.getByRole("button", { name: "핵심 요약 사용" }).click();
await dialog.waitFor();
assert(await dialog.getByRole("checkbox", { name: /웹 검색 사용/ }).isDisabled(), "참고 글 기반 템플릿은 웹 검색을 켤 수 없다");
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("[aria-label='생성된 내용']:has-text('웹 검색: 안 함')", { timeout: 15000 });
assert(toolsOf(lastCall()) === "" && lastCall().input.includes("새로운 사실을 덧붙이지 마세요"), "참고 글 기반 템플릿은 도구를 끄고 새 사실을 쓰지 못하게 한다");
await page.keyboard.press("Escape");

// 9) 블록을 일반 콜아웃으로 풀기, 삭제
await page.locator(".template-block").first().hover();
await page.getByRole("button", { name: "일반 블록으로 풀기" }).first().click();
await sleep(1500);
assert((await page.locator(".template-block").count()) === 1 && (await page.locator(".callout").count()) === 1, "풀면 일반 콜아웃이 되고 내용은 남는다");
// 문서 순서상 첫 블록은 첫 문단 아래에 넣은 '용어 풀이'다.
assert(draft().includes("> [!info] 용어 풀이\n") && (draft().match(/hw-template/g) ?? []).length === 1 && draft().includes("> [!tip] 더 알아보기 <!--hw-template"), "풀면 그 블록의 메타데이터만 파일에서 사라지고 다른 블록은 그대로다");
await page.locator(".template-block").first().hover();
await page.getByRole("button", { name: "블록 삭제" }).first().click();
await sleep(1500);
assert((await page.locator(".template-block").count()) === 0 && !draft().includes("hw-template"), "블록 삭제 버튼으로 지울 수 있다");

// 10) 오류와 취소
await placeCursor("다음 절 내용");
await page.getByRole("button", { name: "더 알아보기 사용" }).click();
await dialog.getByLabel("추가 요청").fill("FAIL");
await dialog.getByRole("button", { name: "생성", exact: true }).click();
await page.waitForSelector("[role='dialog'] [role='alert']:has-text('로그인이 필요해요')", { timeout: 10000 });
ok("CLI 오류를 창 안에 보여준다");
await dialog.getByLabel("추가 요청").fill("SLOW");
await dialog.getByRole("button", { name: /다시 생성|생성/ }).first().click();
await page.getByRole("button", { name: "중지" }).click();
await page.waitForSelector("[role='dialog'] [role='alert']:has-text('취소')", { timeout: 10000 });
ok("생성 중에 중지할 수 있다");
await page.keyboard.press("Escape");

// 11) 템플릿 만들기와 고치기 (파일로 저장된다)
await page.getByRole("button", { name: "새 템플릿" }).click();
await dialog.waitFor();
await dialog.getByLabel("템플릿 이름").fill("개념 정리");
await dialog.getByLabel("블록 모양").selectOption("warning");
await dialog.getByRole("button", { name: "필드 추가" }).click();
await dialog.getByLabel("필드 키").fill("concept");
await dialog.getByLabel("필드 이름").fill("개념");
await dialog.getByRole("checkbox", { name: /필수/ }).check();
await dialog.getByLabel("사전 프롬프트").fill("{{concept}}을(를) 한 문단으로 정리하세요. {{오타}}");
assert((await dialog.innerText()).includes("정의되지 않은 값이 있어요") && (await dialog.innerText()).includes("{{오타}}"), "프롬프트에 정의되지 않은 {{키}}가 있으면 알려준다");
await dialog.getByRole("button", { name: "필드 추가" }).click();
await dialog.getByLabel("필드 키").nth(1).fill("concept");
assert((await dialog.innerText()).includes("다른 필드와 키가 같아요") && (await dialog.getByRole("button", { name: "저장" }).isDisabled()), "필드 키가 겹치면 오류를 보여주고 저장할 수 없다");
await dialog.getByLabel("필드 삭제").nth(1).click();
await dialog.getByLabel("사전 프롬프트").fill("{{concept}}을(를) 한 문단으로 정리하세요.");
await dialog.getByRole("button", { name: "저장" }).click();
await dialog.waitFor({ state: "detached" });
const tplPath = path.join(ws, ".handy-writer", "templates", "개념 정리.md");
await page.waitForSelector("ul[aria-label='템플릿 목록'] [data-template-id='개념 정리']");
const tplFile = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, "utf8") : "";
assert(tplFile.includes("name: 개념 정리") && tplFile.includes("style: warning") && tplFile.includes("key: concept") && tplFile.includes("required: true") && tplFile.endsWith("{{concept}}을(를) 한 문단으로 정리하세요.\n"), "새 템플릿이 작업 폴더의 .handy-writer/templates/ 에 마크다운 파일로 저장된다");

await placeCursor("다음 절 내용");
await page.keyboard.press("Enter");
await page.keyboard.type("/개념");
await page.waitForSelector("[role='option']:has-text('개념 정리')");
await page.keyboard.press("Enter");
await dialog.waitFor();
assert((await dialog.getByLabel(/개념/).getAttribute("aria-invalid")) !== "true" && (await dialog.innerText()).includes("*"), "만든 템플릿이 슬래시 메뉴에 바로 나오고 필수 표시가 있다");
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "Tip 편집" }).click();
await dialog.waitFor();
await dialog.getByLabel("사전 프롬프트").fill("내가 고친 Tip 지침");
await dialog.getByRole("button", { name: "저장" }).click();
await dialog.waitFor({ state: "detached" });
await page.waitForSelector("[data-template-id='tip']:has-text('수정됨')");
assert(fs.existsSync(path.join(ws, ".handy-writer", "templates", "tip.md")), "내장 템플릿을 고치면 같은 이름의 파일로 저장되고 '수정됨'이 표시된다");
await page.getByRole("button", { name: "Tip 편집" }).click();
await dialog.getByRole("button", { name: "기본값으로 되돌리기" }).click();
await dialog.waitFor({ state: "detached" });
await sleep(500);
assert(!fs.existsSync(path.join(ws, ".handy-writer", "templates", "tip.md")), "기본값으로 되돌리면 파일이 지워진다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.length ? JSON.stringify(logs) : ""}`);
await env.close();
