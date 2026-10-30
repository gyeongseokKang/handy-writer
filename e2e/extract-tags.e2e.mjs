// 링크에서 글 가져오기와 태그 추천을 실제 앱에서 확인한다. 가져올 페이지는 이 테스트가 띄우는 작은 웹 서버가 준다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:extract-tags`
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();

const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>달리기를 시작하는 법 | 러닝 블로그</title></head>
<body>
  <nav><a href="/">홈</a> <a href="/about">메뉴 소개</a> 구독하기 광고 배너</nav>
  <article>
    <h1>달리기를 시작하는 법</h1>
    <p class="byline">글: 김러너</p>
    <p>처음 달리기를 시작할 때는 <strong>천천히</strong> 걷기와 달리기를 섞는 것이 좋아요. 무릎에 무리가 가지 않도록 페이스를 조절하고, 달린 뒤에는 스트레칭을 꼭 해 주세요. 이 글은 초보자를 위한 안내예요.</p>
    <h2>준비물</h2>
    <ul><li>가벼운 운동화</li><li>물병</li></ul>
    <img src="/img/run.png" alt="달리는 사람">
    <p>더 자세한 내용은 <a href="/guide">초보 가이드</a>를 보세요. 꾸준히 일주일에 세 번만 달려도 몸이 달라져요. 처음 한 달은 거리보다 시간을 기준으로 삼으세요.</p>
    <div id="late"></div>
  </article>
  <aside>추천 글 광고 영역 지금 할인</aside>
  <footer>저작권 러닝 블로그</footer>
  <script>document.getElementById("late").innerHTML = "<p>스크립트로 그린 마지막 문단이에요. 이 문단도 가져와야 해요. 충분히 긴 문장으로 본문임을 알려 줘요.</p>";</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/post") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
  } else if (req.url === "/img/run.png") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(fs.readFileSync(path.join(import.meta.dirname, "fixtures", "square.png")));
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const files = {
  "달리기 일지.md": "---\ntags: [운동, 달리기]\n---\n\n아침 달리기 5km. 무릎이 조금 아팠다. 페이스 조절과 스트레칭이 중요하다.\n",
  "마라톤 준비.md": "---\ntags: [운동]\n---\n\n마라톤 대회 준비. 장거리 달리기 훈련과 페이스 조절, 스트레칭 루틴.\n",
  "요리 기록.md": "---\ntags: [요리]\n---\n\n된장찌개 레시피. 두부와 애호박.\n",
  "새 글.md": "저녁에 장거리 훈련을 했다. 페이스 조절이 어려웠고 스트레칭을 길게 했다.\n",
};
const env = await launchApp({ open: "새 글", files });
const { page, ws, logs } = env;

// ── 태그 추천 ──
await page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: "연결" }).click();
const panel = page.getByRole("region", { name: "연결 정보" });
await panel.getByRole("button", { name: "태그", exact: true }).click();
const adder = panel.getByRole("group", { name: "태그 추가" });
const chips = adder.getByLabel("추천 태그").getByRole("button");
await chips.first().waitFor({ timeout: 10000 });
const names = (await chips.allInnerTexts()).map((t) => t.trim());
assert(names[0] === "운동", `+ 태그를 누르면 기존 태그에서 이 글에 맞는 것을 먼저 추천한다 (${names.join(", ")})`);
assert(!names.includes("요리"), "관련 없는 태그는 추천하지 않는다");
await page.screenshot({ path: path.join(OUT, "tag-suggest.png") });
await chips.first().click();
await sleep(1200);
const note = () => fs.readFileSync(path.join(ws, "새 글.md"), "utf8");
assert(note().startsWith("---\ntags:\n  - 운동\n---\n\n저녁에"), `추천 태그를 누르면 frontmatter의 tags에 들어간다 (${JSON.stringify(note().slice(0, 40))})`);
assert((await adder.getByLabel("추천 태그").getByRole("button", { name: /^운동/ }).count()) === 0, "더한 태그는 추천 목록에서 빠진다");
await adder.getByLabel("새 태그").fill("훈련일지");
await adder.getByLabel("새 태그").press("Enter");
await sleep(1200);
assert(note().startsWith("---\ntags:\n  - 운동\n  - 훈련일지\n---\n"), "직접 입력한 태그도 더한다");
await panel.getByRole("button", { name: "운동", exact: true }).waitFor({ timeout: 5000 });
assert(true, "더한 태그가 태그 목록에 보인다");

// ── 링크에서 가져오기 ──
await page.getByRole("button", { name: "링크에서 글 가져오기" }).click();
const dialog = page.getByRole("dialog", { name: "링크에서 글 가져오기" });
await dialog.getByLabel("가져올 주소").fill("http://127.0.0.1:1/없음");
await dialog.getByRole("button", { name: "가져오기" }).click();
await dialog.getByRole("alert").waitFor({ timeout: 30000 });
assert((await dialog.getByRole("alert").innerText()).includes("연결하지 못했어요"), `연결할 수 없는 주소는 알린다 (${await dialog.getByRole("alert").innerText()})`);

await dialog.getByLabel("가져올 주소").fill(`${base}/post`);
await dialog.getByRole("button", { name: "가져오기" }).click();
const preview = dialog.getByLabel("가져온 본문 미리보기");
await preview.waitFor({ timeout: 30000 });
const text = await preview.innerText();
assert(text.includes("천천히") && text.includes("## 준비물") && text.includes("- 가벼운 운동화"), "본문과 제목, 목록을 마크다운으로 가져온다");
assert(text.includes("스크립트로 그린 마지막 문단"), "스크립트로 그리는 내용도 가져온다");
assert(!text.includes("광고") && !text.includes("메뉴 소개") && !text.includes("저작권"), "메뉴·광고·꼬리말은 빼고 본문만 가져온다");
assert(text.includes(`![달리는 사람](${base}/img/run.png)`) && text.includes(`[초보 가이드](${base}/guide)`), "그림과 링크는 원래 주소로 남긴다");
assert((await dialog.getByLabel("가져온 글 제목").inputValue()).includes("달리기를 시작하는 법"), "제목을 채운다");
await page.screenshot({ path: path.join(OUT, "extract.png") });
await dialog.getByLabel("가져온 글 제목").fill("달리기 시작하기");
await dialog.getByRole("button", { name: "새 글로 만들기" }).click();
await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("천천히"));
const created = fs.readFileSync(path.join(ws, "달리기 시작하기.md"), "utf8");
assert(created.startsWith(`---\nsource: "${base}/post"\n`) && /extracted: \d{4}-\d{2}-\d{2}/.test(created), "새 글의 frontmatter에 원래 주소와 가져온 날짜를 남긴다");
assert(created.trimEnd().endsWith(`출처: [달리기 시작하기](${base}/post)`), "맨 아래에 출처 링크를 남긴다");

// 앱은 https 그림만 불러오므로(CSP), 테스트 서버(http)의 그림이 막힌 기록은 뺀다.
const unexpected = logs.filter((line) => !/Content Security Policy directive: "img-src/.test(line));
assert(unexpected.length === 0, `콘솔 오류 없음 ${unexpected.join(" | ")}`);
await env.close();
server.close();
