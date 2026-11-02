// 글 내보내기(마크다운, HTML, PDF)를 실제 앱에서 확인한다. 저장 창은 가짜로 바꿔서 정한 경로를 돌려준다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:export`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const png = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "square.png"));

const source = "---\ntags: [시험]\n---\n\n# 소제목\n\n본문 **굵게** 그리고 [[다른 글]]\n\n![[사진.png|그림|120]]\n\n- [x] 끝낸 일\n\n```ts\nconst a = 1;\n```\n";
const longBody = Array.from({ length: 60 }, (_v, i) => `${i + 1}번째 문단입니다. 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하 가나다라마바사 아자차카타파하.`).join("\n\n");
const env = await launchApp({ open: "내글", files: { "내글.md": source, "긴글.md": `# 긴글\n\n${longBody}\n`, "attachments/사진.png": png } });
const { app, page, logs } = env;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hw-export-"));

async function exportAs(format, label) {
  const target = path.join(outDir, `out.${format}`);
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  await page.getByRole("button", { name: "내보내기" }).click();
  await page.getByRole("menuitem", { name: label }).click();
  // PDF·Word는 쪽 설정 창에서 내보내기를 눌러야 저장한다.
  if (format === "pdf" || format === "docx") await page.getByRole("dialog").getByRole("button", { name: "내보내기", exact: true }).click();
  for (let i = 0; i < 50 && !fs.existsSync(target); i++) await sleep(200);
  await sleep(300);
  return target;
}

const md = await exportAs("md", "마크다운");
assert(fs.readFileSync(md, "utf8").startsWith("---\ntags: [시험]\n---\n"), "마크다운에는 frontmatter가 그대로 들어간다");
assert(fs.readFileSync(md, "utf8").includes("![[사진.png|그림|120]]"), "마크다운은 임베드 문법을 그대로 둔다");

const htmlFile = await exportAs("html", "웹 문서");
const html = fs.readFileSync(htmlFile, "utf8");
assert(html.includes("<title>내글</title>") && html.includes("<h1>소제목</h1>"), "HTML에 제목과 본문이 들어간다");
assert(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+"[^>]*width="120"/.test(html), "이미지는 파일에 직접 넣고 크기를 지킨다");
assert(!html.includes("handy-asset://") && !html.includes("contenteditable"), "내부 주소와 편집 속성은 남지 않는다");
assert(html.includes("<strong>굵게</strong>") && html.includes("다른 글") && html.includes("const a = 1;"), "서식, 링크 이름, 코드가 남는다");
assert(!html.includes("tags:"), "frontmatter는 HTML에 나오지 않는다");

const pdf = await exportAs("pdf", "PDF");
const bytes = fs.existsSync(pdf) ? fs.readFileSync(pdf) : Buffer.alloc(0);
assert(bytes.subarray(0, 5).toString() === "%PDF-" && bytes.length > 2000, `PDF 파일이 만들어진다 (${bytes.length} bytes)`);

// ── PDF 설정과 미리보기 ──
const info = (file) => {
  try {
    return execFileSync("pdfinfo", [file], { encoding: "utf8" });
  } catch {
    return "";
  }
};
const text = (file) => {
  try {
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } catch {
    return "";
  }
};
const haveTools = info(pdf) !== "";
if (haveTools) {
  assert(/Page size:\s+59[45](\.\d+)? x 84[12](\.\d+)?/.test(info(pdf)), "기본은 A4 크기다");
}

await page.locator("aside, nav").getByRole("button", { name: "긴글", exact: true }).first().click();
await page.waitForSelector(".note-prose p");
const dialog = page.getByRole("dialog", { name: "PDF로 내보내기" });
async function openPdfDialog() {
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  await page.getByRole("menuitem", { name: "PDF" }).click();
  await dialog.waitFor();
}
const pageCount = async () => {
  await page.waitForFunction(() => /약 \d+쪽/.test(document.querySelector('[data-testid="export-page-count"]')?.textContent ?? ""));
  return Number(/약 (\d+)쪽/.exec(await dialog.getByTestId("export-page-count").textContent())?.[1]);
};

await openPdfDialog();
const basePages = await pageCount();
assert(basePages >= 2, `설정 창이 쪽 수를 보여 준다 (${basePages}쪽)`);
assert((await dialog.locator("[data-preview-page]").count()) === Math.min(basePages, 10), "미리보기가 쪽마다 한 장씩 보인다");
await dialog.getByLabel("글자 크기").fill("14");
await page.waitForFunction((n) => Number(/약 (\d+)쪽/.exec(document.querySelector('[data-testid="export-page-count"]')?.textContent ?? "")?.[1]) > n, basePages);
const bigPages = await pageCount();
assert(bigPages > basePages, `글자를 키우면 쪽 수가 늘어난다 (${basePages} → ${bigPages})`);
await dialog.getByLabel("글자 크기").fill("99");
assert((await dialog.getByLabel("글자 크기").inputValue()) === "99", "입력하는 도중의 값은 그대로 둔다");
await dialog.getByLabel("글자 크기").blur();
assert((await dialog.getByLabel("글자 크기").inputValue()) === "14", "범위를 벗어난 값은 반영하지 않고 직전 값으로 돌아온다");
await dialog.getByLabel("종이").selectOption("A5");
await dialog.getByLabel("좌우 여백").fill("15");
await dialog.getByLabel("쪽 번호").selectOption("of-total");
await dialog.getByLabel("맨 위에 글 제목 넣기").uncheck();
await sleep(800); // 설정이 바뀌고 잠깐 뒤에 다시 계산한다
const lastPages = await pageCount();
const configured = path.join(outDir, "configured.pdf");
await app.evaluate(({ dialog }, file) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
}, configured);
await dialog.getByRole("button", { name: "내보내기", exact: true }).click();
for (let i = 0; i < 50 && !fs.existsSync(configured); i++) await sleep(200);
await sleep(300);
assert(fs.existsSync(configured) && !(await dialog.count()), "내보내면 설정 창이 닫히고 파일이 만들어진다");
if (haveTools) {
  const configuredInfo = info(configured);
  assert(/Page size:\s+(419|420)(\.\d+)? x 59[45](\.\d+)?/.test(configuredInfo), "고른 종이(A5) 크기로 나온다");
  assert(Number(/Pages:\s+(\d+)/.exec(configuredInfo)?.[1]) === lastPages, `미리보기의 쪽 수(${lastPages})와 실제 쪽 수가 같다`);
  const out = text(configured);
  assert(/\b1 \/ \d+\b/.test(out), "쪽 번호(1 / 전체)가 들어간다");
  assert(!/^\s*긴글\s*$/m.test(out), "제목 넣기를 끄면 맨 위 제목이 없다");
}

// 고른 설정은 다음에도 그대로 남는다.
await openPdfDialog();
assert((await dialog.getByLabel("글자 크기").inputValue()) === "14" && (await dialog.getByLabel("종이").inputValue()) === "A5", "고른 설정을 기억한다");
await dialog.getByRole("button", { name: "기본값으로 되돌리기" }).click();
await sleep(300);
assert((await dialog.getByLabel("글자 크기").inputValue()) === "10" && (await dialog.getByLabel("종이").inputValue()) === "A4", "기본값으로 되돌릴 수 있다");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "detached" });
assert(true, "Esc로 설정 창을 닫는다");

// 저장 창에서 취소하면 파일을 만들지 않는다.
const cancelled = path.join(outDir, "cancelled.md");
await app.evaluate(({ dialog }) => {
  dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined });
}, null);
await page.getByRole("button", { name: "내보내기" }).click();
await page.getByRole("menuitem", { name: "마크다운" }).click();
await sleep(500);
assert(!fs.existsSync(cancelled) && !(await page.getByText("내보내지 못했어요").count()), "취소하면 아무것도 만들지 않고 오류도 없다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
