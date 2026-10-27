// 글 내보내기(마크다운, HTML, PDF)를 실제 앱에서 확인한다. 저장 창은 가짜로 바꿔서 정한 경로를 돌려준다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:export`
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const png = fs.readFileSync(path.join(import.meta.dirname, "fixtures", "square.png"));

const source = "---\ntags: [시험]\n---\n\n# 소제목\n\n본문 **굵게** 그리고 [[다른 글]]\n\n![[사진.png|그림|120]]\n\n- [x] 끝낸 일\n\n```ts\nconst a = 1;\n```\n";
const env = await launchApp({ open: "내글", files: { "내글.md": source, "attachments/사진.png": png } });
const { app, page, logs } = env;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hw-export-"));

async function exportAs(format, label) {
  const target = path.join(outDir, `out.${format}`);
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  await page.getByRole("button", { name: "내보내기" }).click();
  await page.getByRole("menuitem", { name: label }).click();
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
