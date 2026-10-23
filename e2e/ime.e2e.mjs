// 한글 조합 입력(IME)과 맞춤법 표시를 실제 앱에서 확인한다. 먼저 `pnpm build`가 필요하다.
// 리눅스에서는 `xvfb-run -a pnpm test:e2e:ime`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert, ok } = createReporter();

const env = await launchApp({
  open: "초안",
  files: { "초안.md": "앞 문장입니다.", "글쓰기 규칙.md": "규칙", "다른 글.md": "다른 내용" },
});
const { page, ws, ime, composingEnter, logs } = env;
const prose = () => page.innerText(".note-prose");
const file = (name) => fs.readFileSync(path.join(ws, name), "utf8");

await page.click(".note-prose");
await page.keyboard.press("End");

// 1) #태그: 조합하는 동안에도 칩이 만들어지고 글자가 깨지지 않는다
await ime.type(" #");
await ime.compose("태그");
await ime.type(" ");
await page.waitForSelector(".note-prose .note-tag");
assert((await page.locator(".note-tag").allInnerTexts()).join() === "#태그" && (await prose()).includes("#태그 "), "한글 #태그를 조합하며 입력하면 칩이 되고 글자가 그대로다");

// 2) [[ 팝업: 조합 중에 목록이 걸러지고, 조합 중 Enter는 아무것도 고르지 않고, 확정 뒤 Enter로 고른다
await page.keyboard.press("Enter");
await ime.type("[[");
await ime.compose("글쓰", { commitLast: false });
await page.waitForSelector("[role='listbox'] [role='option']");
assert((await page.locator("[role='option']").first().innerText()).includes("글쓰기 규칙"), "조합 중에도 [[ 자동완성 목록이 걸러진다");
await composingEnter(".ProseMirror");
await sleep(300);
assert((await page.locator("[role='listbox']").count()) === 1 && (await prose()).includes("[[글쓰"), "조합 중 Enter는 목록을 고르지 않고 조합만 이어 간다");
await ime.type("쓰");
await page.keyboard.press("Enter");
await sleep(300);
assert((await page.locator(".wikilink").allInnerTexts()).join() === "글쓰기 규칙" && !(await prose()).includes("[[글쓰"), "조합을 확정한 뒤 Enter로 고르면 위키링크가 되고 조합 글자가 남지 않는다");

// 3) 슬래시 메뉴도 조합 중 Enter로 고르지 않는다
await page.keyboard.press("Enter");
await ime.type("/");
await ime.compose("콜", { commitLast: false });
await composingEnter(".ProseMirror");
await sleep(300);
assert((await page.locator(".callout").count()) === 0 && (await page.locator("[role='listbox']").count()) === 1, "슬래시 메뉴도 조합 중 Enter로 항목을 고르지 않는다");
await ime.type("콜");
await page.keyboard.press("Enter");
await page.waitForSelector(".callout");
ok("조합을 확정한 뒤 Enter로 콜아웃을 넣는다");

// 4) 조합 중에 앱이 에디터를 건드려도(자동 저장, 색인 갱신, 장식 갱신) 조합이 끊기지 않는다
await page.keyboard.press("ArrowDown");
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await ime.type("문장 ");
const before = await ime.counts();
await ime.set("ㅎ");
await ime.set("하");
fs.writeFileSync(path.join(ws, "새로 생긴 글.md"), "[[초안]] 새 글"); // 목록과 색인이 갱신된다
await sleep(2500); // 자동 저장(600ms), 색인 갱신, 장식 다시 계산
const during = await ime.counts();
assert(during.starts === before.starts + 1 && during.ends === before.ends, "조합 중 2.5초 동안 자동 저장과 색인 갱신이 일어나도 조합이 끊기지 않는다");
await ime.set("한");
await ime.type("한");
await ime.compose("글");
await sleep(1200);
assert((await prose()).includes("문장 한글") && file("초안.md").includes("문장 한글"), "그 뒤에 이어 쓴 글자가 화면과 파일에 정확히 남는다");

// 5) 조합 중에 같은 글이 밖에서 바뀌어도 쓰던 글을 덮어쓰지 않는다
await ime.set("ㅅ");
await ime.set("시");
fs.writeFileSync(path.join(ws, "초안.md"), "밖에서 통째로 바뀐 내용");
await sleep(1500);
assert((await prose()).includes("문장 한글시") && !(await prose()).includes("밖에서 통째로"), "조합 중 외부 변경이 들어와도 쓰던 글이 사라지지 않는다");
await ime.type("시");
await sleep(1500);

// 6) 제목 입력창: 조합 중 Enter는 이름을 바꾸지 않고, 확정 뒤 Enter로 바꾼다
const title = page.locator("input[aria-label='글 제목']");
await title.click();
await title.press("Control+a");
await ime.compose("새목", { commitLast: false }); // 새는 확정, 목은 조합 중
await composingEnter("input[aria-label='글 제목']");
await sleep(500);
assert(fs.existsSync(path.join(ws, "초안.md")), "제목 입력 중 조합 Enter는 파일 이름을 바꾸지 않는다");
await ime.type("목");
await page.keyboard.press("Enter");
await sleep(1000);
assert(fs.existsSync(path.join(ws, "새목.md")) && !fs.existsSync(path.join(ws, "초안.md")), "확정한 뒤 Enter를 누르면 한글 제목으로 파일 이름이 바뀐다");

// 7) 검색창: 조합 중에 결과가 갱신되고 조합 중 Enter는 글을 열지 않는다
await page.click("nav[aria-label='글 목록'] >> text=다른 글");
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("다른 내용"));
await page.keyboard.press("Control+k");
await page.waitForSelector("[role='dialog'][aria-label='글 검색']");
await ime.set("ㄱ");
await ime.set("규");
await ime.set("균");
await sleep(500);
await ime.set("규");
await ime.type("규");
await ime.compose("칙", { commitLast: false });
await page.waitForFunction(() => /\d+개/.test(document.querySelector("[role='dialog']")?.textContent ?? ""));
assert((await page.locator("[role='option']").first().innerText()).includes("글쓰기 규칙"), "검색창에서 한글을 조합하는 중에도 결과가 걸러진다");
await composingEnter("input[aria-label='검색어']");
await sleep(300);
assert((await page.locator("[role='dialog']").count()) === 1, "검색창 조합 중 Enter는 글을 열지 않는다");
await ime.type("칙");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("규칙"));
ok("확정한 뒤 Enter를 누르면 글이 열린다");

// 8) 맞춤법: 조합하며 틀린 글을 써도 낱말을 다 쓰고 커서가 벗어난 뒤에 밑줄이 생긴다
await page.click("nav[aria-label='글 목록'] >> text=새목");
await page.waitForSelector(".note-prose");
await page.click(".note-prose");
await page.keyboard.press("Control+End");
await page.keyboard.press("Enter");
await ime.compose("어떻해", { commitLast: false });
await sleep(400);
assert((await page.locator(".spell-error").count()) === 0, "아직 쓰고 있는 낱말에는 밑줄이 없다");
await ime.type("해");
await sleep(300);
assert((await page.locator(".spell-error").count()) === 0, "조합을 확정해도 커서가 낱말 끝에 있으면 밑줄이 없다");
const compositionsBefore = await ime.counts();
await ime.type(" ");
await ime.compose("지", { commitLast: false });
await page.waitForSelector(".note-prose .spell-error");
assert((await page.locator(".spell-error").first().innerText()) === "어떻해", "낱말을 벗어나 다음 글자를 조합하면 밑줄이 생긴다");
const composing = await ime.counts();
assert(composing.starts === compositionsBefore.starts + 1 && composing.ends === compositionsBefore.ends, "밑줄이 생겨도 새로 시작한 조합이 끊기지 않고 이어진다");
await ime.type("지");
assert((await ime.counts()).ends === compositionsBefore.ends + 1, "확정하면 조합이 정상적으로 끝난다");
assert((await page.locator("button[aria-label='맞춤법 설정']").innerText()).includes("맞춤법 1"), "아래 막대에 맞춤법 개수가 보인다");
await page.screenshot({ path: path.join(OUT, "15-spellcheck.png") });

// 9) 팝업: 바꾸기 / 무시 / 끄기
await page.click(".spell-error");
await page.waitForSelector("[role='dialog'][aria-label='맞춤법 제안']");
assert((await page.innerText("[role='dialog'][aria-label='맞춤법 제안']")).includes("어떡해"), "밑줄을 누르면 고친 낱말을 제안한다");
await page.screenshot({ path: path.join(OUT, "16-spell-popover.png") });
await page.getByRole("button", { name: "바꾸기" }).click();
await sleep(1200);
assert((await prose()).includes("어떡해 지") && (await page.locator(".spell-error").count()) === 0, "바꾸기를 누르면 낱말이 고쳐지고 밑줄이 사라진다");
assert(file("새목.md").includes("어떡해 지"), "고친 글이 파일에 저장된다");

await page.keyboard.press("Control+End");
await page.keyboard.press("Enter");
await ime.type("웬지 슬프다. 그리고 됬다고 한다. 끝");
await page.waitForFunction(() => document.querySelectorAll(".spell-error").length === 2);
await page.locator(".spell-error", { hasText: "웬지" }).click();
await page.getByRole("button", { name: "무시" }).click();
await page.waitForFunction(() => document.querySelectorAll(".spell-error").length === 1);
ok("무시를 누르면 그 낱말의 밑줄만 사라진다");
await page.click("nav[aria-label='글 목록'] >> text=다른 글");
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("다른 내용"));
await page.click("nav[aria-label='글 목록'] >> text=새목");
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("웬지"));
await sleep(300);
assert((await page.locator(".spell-error").allInnerTexts()).join() === "됬다고", "무시한 낱말은 다른 글에 다녀와도 다시 밑줄이 생기지 않는다");

// 설정 창: 온라인 검사 안내와 상태, 표시 끄기/켜기
await page.getByRole("button", { name: "맞춤법 설정" }).click();
const menu = page.locator("[role='dialog'][aria-label='맞춤법 설정']");
await menu.waitFor();
assert((await menu.innerText()).includes("문단의 내용이 다음·네이버 서버로 전송"), "온라인 검사를 켜면 문단이 서버로 전송된다는 안내가 보인다");
await page.waitForFunction(() => /오프라인이라 건너뛰고 있어요|연결됨/.test(document.querySelector("[role='dialog'][aria-label='맞춤법 설정']")?.textContent ?? ""), null, { timeout: 15000 });
const onlineState = await menu.innerText();
assert(/오프라인이라 건너뛰고 있어요|연결됨/.test(onlineState), `온라인 검사 상태가 표시된다 (${onlineState.includes("연결됨") ? "연결됨" : "오프라인"})`);
assert((await page.locator(".spell-error").count()) === 1, "온라인 검사를 쓸 수 없어도 규칙 기반 밑줄은 그대로 있다");

await menu.getByRole("checkbox", { name: "온라인 검사 (다음·네이버)" }).uncheck();
assert((await menu.innerText()).includes("꺼져 있어요"), "온라인 검사를 끌 수 있다");
await menu.getByRole("checkbox", { name: "온라인 검사 (다음·네이버)" }).check();

await menu.getByRole("checkbox", { name: "맞춤법 표시" }).uncheck();
await page.keyboard.press("Escape");
await sleep(300);
assert((await page.locator(".spell-error").count()) === 0 && (await page.getByRole("button", { name: "맞춤법 설정" }).innerText()) === "맞춤법 끔", "맞춤법 표시를 끄면 밑줄이 모두 사라진다");
await page.getByRole("button", { name: "맞춤법 설정" }).click();
await menu.getByRole("checkbox", { name: "맞춤법 표시" }).check();
await page.keyboard.press("Escape");
await sleep(300);
assert((await page.locator(".spell-error").count()) === 1, "다시 켜면 밑줄이 돌아온다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.length ? JSON.stringify(logs) : ""}`);
await env.close();
