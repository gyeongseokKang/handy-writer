// 오늘 쓴 양, 글 끼워 넣기, 즐겨찾기, 글 속성, 원고 묶기, Word 내보내기를 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:writing`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

import { createReporter, launchApp, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const png = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "square.png"));

const env = await launchApp({
  open: "메모",
  files: {
    "책/1장.md": "# 시작\n\n첫 장 본문[^1]\n\n[^1]: 첫 각주\n",
    "책/2장.md": "둘째 장 본문\n\n## 세부\n\n세부 내용\n\n## 다음\n\n다음 내용\n",
    "책/10장.md": "열째 장\n",
    "메모.md": "---\ntitle: 메모\ncount: 3\ndraft: true\ntags: [a]\n---\n\n메모 본문\n\n![[2장#세부]]\n\n![[없는 글]]\n",
    "그림글.md": "그림 앞\n\n![[사진.png|사진|100]]\n\n각주가 있는 문장[^a]\n\n[^a]: 각주 내용\n",
    "attachments/사진.png": png,
  },
});
const { app, page, ws, logs } = env;
const read = (rel) => fs.readFileSync(path.join(ws, rel), "utf8");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hw-writing-"));
const tree = page.locator("nav[aria-label='글 목록']");
const waitFor = async (check, tries = 40) => {
  for (let i = 0; i < tries && !(await check()); i++) await sleep(150);
  return check();
};
async function stubSave(file) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, file);
}

// ── 글 끼워 넣기 ───────────────────────────────────────────────
const embed = page.getByRole("figure", { name: "끼워 넣은 글: 2장#세부" });
await embed.waitFor();
await waitFor(async () => (await embed.textContent())?.includes("세부 내용"));
const embedText = (await embed.textContent()) ?? "";
assert(embedText.includes("세부 내용") && !embedText.includes("다음 내용") && !embedText.includes("둘째 장 본문"), "![[글#소제목]]은 그 절만 펼쳐 보여 준다");
assert(await page.getByRole("figure", { name: "끼워 넣은 글: 없는 글" }).getByText("아직 없는 글이에요").isVisible(), "없는 글을 끼워 넣으면 만들기 안내가 나온다");
fs.writeFileSync(path.join(ws, "책/2장.md"), "둘째 장 본문\n\n## 세부\n\n고친 세부\n\n## 다음\n\n다음 내용\n");
assert(await waitFor(async () => (await embed.textContent())?.includes("고친 세부")), "끼워 넣은 글이 바뀌면 다시 읽는다");

// ── 글 속성 ───────────────────────────────────────────────────
await page.getByRole("button", { name: "속성 3" }).click();
const props = page.getByRole("group", { name: "글 속성" });
await props.waitFor();
assert((await props.getByLabel("title 값").inputValue()) === "메모", "속성 표에 frontmatter 값이 보인다 (태그는 빼고)");
assert((await props.getByLabel("tags 값").count()) === 0, "태그는 위 태그 줄에서 다룬다");
await props.getByLabel("count 값").fill("5");
await props.getByLabel("count 값").press("Enter");
assert(await waitFor(() => read("메모.md").includes("count: 5\n")), "값을 고치면 파일에 바로 저장된다");
await props.getByLabel("draft 값").uncheck();
assert(await waitFor(() => read("메모.md").includes("draft: false\n")), "예/아니오 값은 체크 상자로 고친다");
await props.getByRole("button", { name: "속성 추가" }).click();
await props.getByLabel("새 속성 이름").fill("status");
await props.getByLabel("새 속성 값").fill("초고");
await props.getByRole("button", { name: "더하기" }).click();
assert(await waitFor(() => read("메모.md").includes("status: 초고\n")), "새 속성을 더한다");
await props.getByLabel("title 속성 지우기").click();
assert(await waitFor(() => !read("메모.md").includes("title:")), "속성을 지운다");
assert(read("메모.md").includes("tags: [a]") && read("메모.md").includes("메모 본문"), "다른 값과 본문은 그대로 둔다");

// ── 오늘 쓴 양 ─────────────────────────────────────────────────
const today = page.getByRole("button", { name: "오늘 쓴 양" });
assert((await today.textContent())?.includes("+0자"), `속성만 고치면 쓴 양은 그대로다 (${await today.textContent()})`);
await page.locator(".ProseMirror p", { hasText: "메모 본문" }).click();
await page.keyboard.press("End");
await sleep(150);
await page.keyboard.type(" hello");
assert(await waitFor(async () => (await today.textContent())?.includes("+6자")), `저장하면 오늘 쓴 양이 늘어난다 (${await today.textContent()})`);
await today.click();
const statsPanel = page.getByRole("dialog", { name: "오늘 쓴 양" });
await statsPanel.waitFor();
assert(await statsPanel.getByText("1일 연속").isVisible(), "연속 기록을 보여 준다");
assert(await statsPanel.getByRole("img", { name: /날마다 쓴 양/ }).isVisible(), "잔디 달력이 보인다");
await statsPanel.getByLabel("하루 목표").fill("100");
await statsPanel.getByLabel("하루 목표").press("Enter");
assert(await waitFor(async () => (await today.textContent())?.includes("6/100자")), "하루 목표를 정하면 진행을 보여 준다");
await page.keyboard.press("Escape");
await sleep(2500);
const stats = JSON.parse(fs.readFileSync(path.join(env.ud, "writing-stats.json"), "utf8"));
assert(Object.values(stats.roots[ws].days).includes(6), "쓴 양은 사용자 데이터 폴더에 기록된다 (작업 폴더에는 남기지 않는다)");

// ── 즐겨찾기 ───────────────────────────────────────────────────
await tree.getByRole("button", { name: "1장", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "즐겨찾기에 추가" }).click();
const favorites = page.getByRole("region", { name: "즐겨찾기" });
await favorites.waitFor();
await tree.getByRole("button", { name: "책", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "즐겨찾기에 추가" }).click();
assert((await favorites.getByRole("listitem").allTextContents()).join("|") === "1장|책", "글과 폴더를 즐겨찾기에 더한다");
await favorites.getByRole("button", { name: "1장", exact: true }).click();
assert(await waitFor(async () => (await page.getByLabel("글 제목").first().inputValue()) === "1장"), "즐겨찾기를 누르면 그 글을 연다");

// ── 원고 묶기 ─────────────────────────────────────────────────
await tree.getByRole("button", { name: "책", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "원고로 보기" }).click();
const manuscript = page.getByRole("dialog", { name: "원고: 책" });
await manuscript.waitFor();
const chapters = manuscript.getByRole("list", { name: "장 목록" });
const chapterNames = () => chapters.locator("button[title$=' 열기']").allTextContents();
assert((await chapterNames()).join("|") === "1장|2장|10장", `장은 숫자 크기순으로 늘어놓는다 (${(await chapterNames()).join("|")})`);
assert(await waitFor(async () => (await manuscript.getByRole("status", { name: "원고 전체 분량" }).textContent()) !== "0자"), "원고 전체 분량을 센다");
await manuscript.getByRole("button", { name: "10장 위로" }).click();
assert((await chapterNames()).join("|") === "1장|10장|2장", "화살표로 장 순서를 바꾼다");
await manuscript.getByLabel("2장 원고에 넣기").uncheck();
await manuscript.getByLabel("원고 목표 분량").fill("1000");
await manuscript.getByLabel("원고 목표 분량").press("Enter");
const config = () => JSON.parse(read(".handy-writer/manuscripts.json"))["책"];
assert(await waitFor(() => config()?.goal === 1000), "목표 분량을 저장한다");
assert(config().order.join("|") === "1장.md|10장.md|2장.md" && config().excluded.join("|") === "2장.md", "순서와 뺀 장을 .handy-writer/manuscripts.json에 남긴다");
assert(await manuscript.getByRole("progressbar", { name: "원고 진행률" }).isVisible(), "목표에 대한 진행률을 보여 준다");

const mdOut = path.join(outDir, "book.md");
await stubSave(mdOut);
await manuscript.getByRole("button", { name: "마크다운", exact: true }).click();
assert(await waitFor(() => fs.existsSync(mdOut)), "원고를 마크다운 한 파일로 내보낸다");
const book = fs.readFileSync(mdOut, "utf8");
assert(book.startsWith("# 시작\n\n첫 장 본문[^c1-1]") && book.includes("[^c1-1]: 첫 각주") && book.includes("# 10장\n\n열째 장") && !book.includes("둘째 장"), "장 순서대로 잇고, 제목 없는 장에는 글 이름을 붙이며, 각주가 겹치지 않게 하고, 뺀 장은 넣지 않는다");

const docxOut = path.join(outDir, "book.docx");
await stubSave(docxOut);
await manuscript.getByRole("button", { name: "Word", exact: true }).click();
assert(await waitFor(() => fs.existsSync(docxOut) && fs.statSync(docxOut).size > 0), "원고를 Word 파일로 내보낸다");
await sleep(300);
const bookZip = unzipSync(fs.readFileSync(docxOut));
const bookXml = strFromU8(bookZip["word/document.xml"]);
assert(bookXml.includes("첫 장 본문") && bookXml.includes("열째 장") && bookXml.indexOf("첫 장 본문") < bookXml.indexOf("열째 장"), "Word 원고에 장이 순서대로 들어간다");
assert(strFromU8(bookZip["word/footnotes.xml"]).includes("첫 각주"), "원고의 각주는 Word 각주가 된다");
await manuscript.getByRole("button", { name: "닫기" }).click();

// 이름을 바꾸면 즐겨찾기와 원고 순서가 따라간다.
await tree.getByRole("button", { name: "1장", exact: true }).click({ button: "right" });
await page.getByRole("menuitem", { name: "이름 바꾸기" }).click();
await page.getByLabel("1장 새 이름").fill("첫째 장");
await page.getByLabel("1장 새 이름").press("Enter");
assert(await waitFor(async () => (await favorites.getByRole("listitem").allTextContents()).includes("첫째 장")), "이름을 바꾸면 즐겨찾기도 따라간다");
assert(await waitFor(() => config().order[0] === "첫째 장.md"), "이름을 바꾸면 원고 순서의 경로도 따라간다");
await favorites.getByRole("listitem").filter({ hasText: "책" }).hover();
await favorites.getByRole("button", { name: "책 즐겨찾기에서 빼기" }).click();
assert((await favorites.getByRole("listitem").allTextContents()).join("|") === "첫째 장", "즐겨찾기에서 뺀다");

// ── Word 내보내기 (글 하나) ─────────────────────────────────────
await tree.getByRole("button", { name: "그림글", exact: true }).click();
await page.waitForSelector(".note-prose img.embed-media");
const noteDocx = path.join(outDir, "note.docx");
await stubSave(noteDocx);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "Word" }).click();
assert(await waitFor(() => fs.existsSync(noteDocx) && fs.statSync(noteDocx).size > 0), "글을 Word로 내보낸다");
await sleep(300);
const noteZip = unzipSync(fs.readFileSync(noteDocx));
const noteXml = strFromU8(noteZip["word/document.xml"]);
assert(noteXml.includes("그림글") && noteXml.includes("각주가 있는 문장"), "제목과 본문이 들어간다");
assert(Object.keys(noteZip).some((name) => name.startsWith("word/media/")), "작업 폴더 그림이 파일 안에 들어간다");
assert(strFromU8(noteZip["word/footnotes.xml"]).includes("각주 내용"), "각주가 Word 각주로 들어간다");

// ── 끼워 넣은 글은 내보낼 때 펼친다 ────────────────────────────
await tree.getByRole("button", { name: "메모", exact: true }).click();
await embed.waitFor();
const htmlOut = path.join(outDir, "memo.html");
await stubSave(htmlOut);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "웹 문서" }).click();
assert(await waitFor(() => fs.existsSync(htmlOut)), "HTML로 내보낸다");
const memoHtml = fs.readFileSync(htmlOut, "utf8");
assert(memoHtml.includes('class="note-embed"') && memoHtml.includes("고친 세부") && !memoHtml.includes("다음 내용"), "끼워 넣은 글은 내보낼 때 그 내용으로 펼친다");

// ── 명령 팔레트 ───────────────────────────────────────────────
await page.keyboard.press("Control+Shift+P");
await page.getByLabel("검색어").fill(">원고");
assert(await page.getByRole("option", { name: /원고 보기/ }).isVisible(), "명령 팔레트에서 원고 보기를 찾는다");
await page.keyboard.press("Enter");
assert(await page.getByRole("dialog", { name: /^원고: / }).isVisible(), "지금 글의 폴더를 원고로 연다");
await page.keyboard.press("Escape");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
