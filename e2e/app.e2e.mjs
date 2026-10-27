// 빌드된 앱(out/)을 실제 Electron으로 띄워서 확인하는 E2E. 먼저 `pnpm build`가 필요하다.
// 화면이 없는 리눅스에서는 `xvfb-run -a pnpm test:e2e`로 실행한다.
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const electronPath = createRequire(import.meta.url)("electron");
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "test-results");
fs.mkdirSync(OUT, { recursive: true });
const assert = (c, m) => { if (!c) { console.log("FAIL:", m); process.exitCode = 1; } else console.log("ok  :", m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hw-ws-"));
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "hw-ud-"));
  fs.writeFileSync(path.join(ud, "config.json"), JSON.stringify({ workspaceRoot: ws }));
  fs.mkdirSync(path.join(ws, "일기"));
  fs.mkdirSync(path.join(ws, ".git"));
  fs.writeFileSync(path.join(ws, ".git", "hidden.md"), "no");
  const seed = "---\ntitle: 시작\ntags: [가이드]\n---\n\n# 시작하기\n\n> [!tip] 팁\n> 콜아웃 본문\n\n- [ ] 할 일\n\n다음은 [[글쓰기 규칙]] 입니다.\n";
  fs.writeFileSync(path.join(ws, "시작하기.md"), seed);
  fs.writeFileSync(path.join(ws, "글쓰기 규칙.md"), "# 규칙\n\n짧게 쓴다.\n");
  fs.writeFileSync(path.join(ws, "일기", "오늘.md"), "오늘의 일기\n");

  const aiLog = path.join(ud, "fake-claude.log");
  const app = await electron.launch({
    executablePath: electronPath,
    env: { ...process.env, GIT_AUTHOR_NAME: "테스터", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "테스터", GIT_COMMITTER_EMAIL: "t@example.com", HANDY_WRITER_CLAUDE_PATH: path.join(ROOT, "e2e", "fake-claude.mjs"), FAKE_CLAUDE_LOG: aiLog },
    args: [ROOT, "--no-sandbox", "--disable-gpu", `--user-data-dir=${ud}`],
  });
  const logs = [];
  const page = await app.firstWindow();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.waitForSelector("nav[aria-label='글 목록']");
  await sleep(500);

  const names = await page.$$eval("nav[aria-label='글 목록'] span.truncate", (els) => els.map((e) => e.textContent));
  console.log("sidebar:", names);
  assert(names.includes("시작하기") && names.includes("글쓰기 규칙") && names.includes("오늘"), "사이드바에 글과 하위 폴더 글이 보인다");
  assert(!names.includes("hidden"), "숨김 폴더(.git)의 글은 보이지 않는다");

  // 글 열기, frontmatter 숨김, 콜아웃/위키링크 렌더링
  await page.waitForSelector(".note-prose");
  await page.click("nav >> text=시작하기");
  await page.waitForSelector(".note-prose .callout");
  const proseText = await page.innerText(".note-prose");
  assert(proseText.includes("시작하기") && !proseText.includes("tags:"), "frontmatter는 에디터에 보이지 않는다");
  assert((await page.$$(".note-prose .callout[data-callout='tip']")).length === 1, "콜아웃이 렌더링된다");
  assert((await page.$$(".note-prose .wikilink")).length === 1, "위키링크가 렌더링된다");
  await page.screenshot({ path: path.join(OUT, "1-open.png") });

  // 열기만 했을 때는 파일을 다시 쓰지 않는다
  await sleep(1200);
  assert(fs.readFileSync(path.join(ws, "시작하기.md"), "utf8") === seed, "열기만 하면 파일이 바뀌지 않는다");

  // 편집 → 자동 저장, frontmatter 보존
  await page.click(".note-prose > p:last-of-type");
  await page.keyboard.press("End");
  await page.keyboard.type(" 추가한 문장");
  await sleep(1500);
  const saved = fs.readFileSync(path.join(ws, "시작하기.md"), "utf8");
  assert(saved.startsWith("---\ntitle: 시작\ntags: [가이드]\n---\n\n# 시작하기"), "저장 후 frontmatter가 그대로다");
  assert(saved.includes("[[글쓰기 규칙]] 입니다. 추가한 문장"), "편집한 내용이 자동 저장되고 위키링크가 유지된다");
  assert(saved.includes("> [!tip] 팁\n> 콜아웃 본문"), "콜아웃이 유지된다");
  console.log(JSON.stringify(saved));

  // 슬래시 메뉴
  await page.keyboard.press("Enter");
  await page.keyboard.type("/콜");
  await page.waitForSelector("[role='listbox'] [role='option']");
  await page.screenshot({ path: path.join(OUT, "2-slash.png") });
  await page.keyboard.press("Enter");
  await sleep(300);
  assert((await page.$$(".note-prose .callout")).length === 2, "슬래시 메뉴로 콜아웃을 삽입한다");
  await page.keyboard.type("슬래시로 만든 콜아웃");

  // [[ 자동완성
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[[글쓰");
  await page.waitForSelector("[role='listbox'] [role='option']");
  await page.screenshot({ path: path.join(OUT, "3-wikilink-suggest.png") });
  await page.keyboard.press("Enter");
  await sleep(300);
  assert((await page.$$(".note-prose .wikilink")).length === 2, "[[ 자동완성으로 위키링크를 삽입한다");

  // 위키링크 클릭 → 이동
  await page.click(".note-prose .wikilink >> nth=0");
  await sleep(800);
  const afterNav = await page.innerText(".note-prose");
  assert(afterNav.includes("짧게 쓴다"), "위키링크를 누르면 해당 글로 이동한다");
  const afterSave = fs.readFileSync(path.join(ws, "시작하기.md"), "utf8");
  assert(afterSave.includes("[!note]") && /\[\[글쓰기 규칙\]\]/.test(afterSave), "글을 옮길 때 저장 대기 내용이 먼저 저장된다");
  await page.screenshot({ path: path.join(OUT, "4-navigated.png") });

  // 없는 글로 링크 → 새 글 생성
  await page.click("nav >> text=시작하기");
  await sleep(600);

  // 외부 변경 반영
  fs.writeFileSync(path.join(ws, "글쓰기 규칙.md"), "# 규칙\n\n밖에서 바꾼 내용\n");
  await page.click("nav >> text=글쓰기 규칙");
  await sleep(600);
  fs.writeFileSync(path.join(ws, "글쓰기 규칙.md"), "# 규칙\n\n다시 밖에서 바꾼 내용\n");
  await sleep(1200);
  assert((await page.innerText(".note-prose")).includes("다시 밖에서 바꾼 내용"), "다른 프로그램이 바꾼 내용이 열린 글에 반영된다");

  // 새 글 + 제목(파일 이름) 바꾸기
  await page.click("button[aria-label='새 글']");
  await sleep(600);
  assert(fs.existsSync(path.join(ws, "제목 없음.md")), "새 글 버튼이 제목 없음.md를 만든다");
  const title = page.locator("input[aria-label='글 제목']");
  await title.fill("나의 첫 글");
  await title.press("Enter");
  await sleep(800);
  assert(fs.existsSync(path.join(ws, "나의 첫 글.md")) && !fs.existsSync(path.join(ws, "제목 없음.md")), "제목을 바꾸면 파일 이름이 바뀐다");
  await page.keyboard.type("새 글 본문입니다");
  await sleep(1500);
  assert(fs.readFileSync(path.join(ws, "나의 첫 글.md"), "utf8") === "새 글 본문입니다\n", "새 글에 쓴 내용이 이름 바뀐 파일에 저장된다");
  await page.screenshot({ path: path.join(OUT, "5-new-note.png") });

  // 검색
  await page.fill("input[aria-label='글 검색']", "일기");
  await sleep(300);
  const filtered = await page.$$eval("nav[aria-label='글 목록'] span.truncate", (els) => els.map((e) => e.textContent));
  assert(filtered.includes("오늘") && !filtered.includes("시작하기"), "검색이 글 목록을 거른다");

  // 서식 툴바와 블록 드래그 핸들
  await page.fill("input[aria-label='글 검색']", "");
  await page.click("nav >> text=오늘");
  await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("오늘의 일기"));
  await page.hover(".note-prose > p >> nth=0");
  await page.waitForSelector(".block-handle", { state: "visible", timeout: 5000 });
  console.log("ok  : 문단에 마우스를 올리면 드래그 핸들이 보인다");
  await page.click(".note-prose > p >> nth=0");
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.waitForSelector("button[aria-label='굵게']", { timeout: 5000 });
  await page.click("button[aria-label='굵게']");
  await sleep(1500);
  assert(fs.readFileSync(path.join(ws, "일기", "오늘.md"), "utf8") === "**오늘의 일기**\n", "선택 서식 툴바로 적용한 굵게가 저장된다");

  // 연결 정보: 백링크, 태그, 없는 글, 이름 변경 시 링크 갱신
  await page.fill("input[aria-label='글 검색']", "");
  await page.click("nav[aria-label='글 목록'] >> text=글쓰기 규칙");
  await page.waitForSelector("ul[aria-label='백링크'] >> text=시작하기", { timeout: 5000 });
  console.log("ok  : 연결 정보 패널에 백링크(시작하기)가 보인다");
  await page.screenshot({ path: path.join(OUT, "6-links-panel.png") });

  await page.getByRole("tab", { name: "태그" }).click();
  await page.waitForSelector("ul[aria-label='태그 목록'] >> text=가이드", { timeout: 5000 });
  await page.click("ul[aria-label='태그 목록'] >> text=가이드");
  await page.click("ul[aria-label='태그 목록'] >> text=시작하기");
  await page.waitForSelector(".note-prose .callout");
  console.log("ok  : 태그 탭에서 frontmatter 태그로 글을 찾아 연다");
  await page.getByRole("tab", { name: "글" }).click();

  await page.click("nav[aria-label='글 목록'] >> text=나의 첫 글");
  await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("새 글 본문입니다"));
  await page.click(".note-prose > p:last-of-type");
  await page.keyboard.press("End");
  await page.keyboard.type(" #아이디어 ");
  await page.keyboard.type("[[아직 없는 글]]");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".note-prose .note-tag[data-tag='아이디어']");
  await page.waitForSelector(".note-prose .wikilink-missing");
  console.log("ok  : 본문 #태그는 칩으로, 없는 글 링크는 흐리게 보인다");
  await sleep(1200);
  assert(
    fs.readFileSync(path.join(ws, "나의 첫 글.md"), "utf8") === "새 글 본문입니다 #아이디어 [[아직 없는 글]]\n",
    "직접 타이핑한 [[링크]]가 깨지지 않고 그대로 저장된다",
  );
  await page.waitForSelector("ul[aria-label='나가는 링크'] >> text=아직 없는 글", { timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, "7-tag-and-missing.png") });
  await page.getByRole("tab", { name: "태그" }).click();
  await page.waitForSelector("ul[aria-label='태그 목록'] >> text=아이디어", { timeout: 5000 });
  console.log("ok  : 새로 쓴 #태그가 태그 목록에 반영된다");
  await page.getByRole("tab", { name: "글" }).click();

  await page.click("ul[aria-label='나가는 링크'] >> text=아직 없는 글");
  await sleep(800);
  assert(fs.existsSync(path.join(ws, "아직 없는 글.md")), "없는 글 링크를 누르면 그 이름의 글이 만들어진다");

  await page.click("nav[aria-label='글 목록'] >> text=글쓰기 규칙");
  await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("다시 밖에서 바꾼 내용"));
  const renameTitle = page.locator("input[aria-label='글 제목']");
  await renameTitle.fill("글쓰기 원칙");
  await renameTitle.press("Enter");
  await sleep(1200);
  const linked = fs.readFileSync(path.join(ws, "시작하기.md"), "utf8");
  assert(linked.includes("[[글쓰기 원칙]]") && !linked.includes("[[글쓰기 규칙]]"), "글 이름을 바꾸면 다른 글의 [[링크]]도 새 이름으로 바뀐다");
  assert(linked.startsWith("---\ntitle: 시작\ntags: [가이드]\n---\n"), "링크를 고쳐 쓴 글의 frontmatter도 그대로다");

  // 그래프
  await page.click("button[aria-label='그래프 보기']");
  await page.waitForSelector("[data-node-count]");
  await page.waitForFunction(() => document.querySelector("[data-node-count]")?.getAttribute("data-node-count") === "5", null, { timeout: 5000 });
  const linkCount = await page.getAttribute("[data-node-count]", "data-link-count");
  assert(linkCount === "2", `그래프에 글 5개와 링크 2개가 그려진다 (링크 ${linkCount}개)`);
  await sleep(2500);
  await page.screenshot({ path: path.join(OUT, "8-graph.png") });
  await page.click("button[aria-label='그래프 보기']");
  await page.waitForSelector(".note-prose");

  // AI 패널 (가짜 claude CLI 사용)
  fs.writeFileSync(path.join(ws, "교정 대상.md"), "나는 어제 학교에 갔는데 선생님이 않계셔서 되돌아 왔다.\n\n둘째 문단입니다.\n");
  await page.click("nav[aria-label='글 목록'] >> text=교정 대상");
  await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("둘째 문단입니다"));
  await page.getByRole("tab", { name: "AI" }).click();
  await page.waitForSelector("[aria-label='AI 도우미']");
  assert((await page.locator("[role='alert']").count()) === 0, "claude CLI가 감지되면 경고가 없다");

  // 글쓰기 룰 저장
  await page.locator("summary", { hasText: "나의 글쓰기 룰" }).click();
  await page.fill("textarea[aria-label='글쓰기 룰']", "- 존댓말을 쓴다\n- 한 문장은 60자 이내");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await sleep(500);
  assert(
    fs.readFileSync(path.join(ws, ".handy-writer", "rules.md"), "utf8") === "- 존댓말을 쓴다\n- 한 문장은 60자 이내",
    "글쓰기 룰이 작업 폴더의 .handy-writer/rules.md에 저장된다",
  );

  // 참고할 글 추가
  await page.fill("input[aria-label='참고할 글 찾기']", "글쓰기");
  await page.click("[aria-label='AI 도우미'] li >> text=글쓰기 원칙");
  await page.waitForSelector("ul[aria-label='참고할 글'] >> text=글쓰기 원칙");

  // 선택한 문단만 맞춤법 교정
  await page.click(".note-prose > p >> nth=0");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "맞춤법 교정" }).click();
  await page.waitForSelector("[aria-label='변경 내용'] ins", { timeout: 10000 });
  const added = await page.$$eval("[aria-label='변경 내용'] ins", (els) => els.map((e) => e.textContent?.trim()).join("|"));
  const removed = await page.$$eval("[aria-label='변경 내용'] del", (els) => els.map((e) => e.textContent?.trim()).join("|"));
  assert(added.includes("안") && removed.includes("않"), `교정 결과가 변경 내용(diff)으로 보인다 (+${added} / -${removed})`);
  await page.screenshot({ path: path.join(OUT, "9-ai-proofread.png") });

  const calls = fs.readFileSync(aiLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const call = calls[calls.length - 1];
  assert(call.input.includes("- 존댓말을 쓴다") && call.input.includes("<writing_rules>"), "프롬프트에 글쓰기 룰이 들어간다");
  assert(call.input.includes('<note name="글쓰기 원칙">'), "프롬프트에 참고할 글이 이름과 함께 들어간다");
  assert(call.input.includes("<text>\n나는 어제 학교에 갔는데") && !call.input.includes("둘째 문단입니다"), "선택한 문단만 대상으로 보낸다");
  assert(call.args.includes("--tools") && call.args[call.args.indexOf("--tools") + 1] === "", "AI 호출에서 도구를 끈다");

  await page.getByRole("button", { name: "선택 부분에 적용" }).click();
  await sleep(1500);
  assert(
    fs.readFileSync(path.join(ws, "교정 대상.md"), "utf8") === "나는 어제 학교에 갔는데 선생님이 안 계셔서 되돌아왔다.\n\n둘째 문단입니다.\n",
    "교정 결과가 선택한 문단에만 적용되고 저장된다",
  );

  // 이어쓰기 → 아래에 삽입 (위키링크 포함)
  await page.click(".note-prose > p >> nth=1");
  await page.getByRole("button", { name: "이어쓰기" }).click();
  await page.waitForSelector("[aria-label='결과 글']:has-text('글쓰기 규칙')", { timeout: 10000 });
  await page.getByRole("button", { name: "아래에 삽입" }).click();
  await sleep(1500);
  assert(
    fs.readFileSync(path.join(ws, "교정 대상.md"), "utf8").endsWith("둘째 문단입니다.\n\n이어서 쓴 문장입니다. 자세한 내용은 [[글쓰기 규칙]]을 참고하세요.\n"),
    "이어쓰기 결과가 아래에 삽입되고 [[링크]]가 링크로 저장된다",
  );

  // 오류와 취소
  await page.fill("textarea[aria-label='추가 요청']", "FAIL");
  await page.getByRole("button", { name: "지시대로 처리" }).click();
  await page.waitForSelector("[aria-label='AI 결과'] [role='alert']:has-text('로그인이 필요해요')", { timeout: 10000 });
  console.log("ok  : CLI 오류 메시지를 화면에 보여준다");
  await page.getByRole("button", { name: "닫기" }).click();

  await page.fill("textarea[aria-label='추가 요청']", "SLOW");
  await page.getByRole("button", { name: "다듬기" }).click();
  await page.getByRole("button", { name: "중지" }).click();
  await page.waitForSelector("[aria-label='AI 결과'] [role='alert']:has-text('취소')", { timeout: 10000 });
  console.log("ok  : 실행 중인 AI 요청을 중지할 수 있다");
  await page.getByRole("button", { name: "닫기" }).click();

  // 전체 검색 (Ctrl+K)
  await page.click(".note-prose");
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[role='dialog'][aria-label='글 검색']");
  assert(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "검색어"), "Ctrl+K로 검색창이 열리고 입력창에 포커스가 간다");
  assert((await page.innerText("[role='dialog']")).includes("최근 글"), "검색어가 없으면 최근 글을 보여준다");
  await page.keyboard.type("계셔서");
  await page.waitForSelector("[role='option'] mark");
  const optionText = await page.innerText("[role='option'] >> nth=0");
  const markText = await page.innerText("[role='option'] mark >> nth=0");
  assert(optionText.includes("교정 대상") && markText === "계셔서", `본문에서 찾아 일치한 단어를 강조한다 (${markText})`);
  await page.screenshot({ path: path.join(OUT, "12-search.png") });
  await page.keyboard.press("Enter");
  await page.waitForSelector("[role='dialog'][aria-label='글 검색']", { state: "detached" });
  await page.waitForFunction(() => getSelection()?.toString() === "계셔서", null, { timeout: 5000 });
  console.log("ok  : Enter로 글을 열면 찾은 단어가 선택되어 보인다");

  await page.keyboard.press("Control+p");
  await page.waitForSelector("[role='dialog'][aria-label='글 검색']");
  await page.keyboard.type("원칙");
  await page.waitForFunction(() => /\d+개/.test(document.querySelector("[role='dialog']")?.textContent ?? ""));
  const titleHits = await page.$$eval("[role='option']", (els) => els.map((e) => e.textContent?.slice(0, 40)));
  assert(titleHits[0]?.includes("글쓰기 원칙"), `제목으로도 찾고 가장 위에 온다 ${JSON.stringify(titleHits)}`);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role='dialog'][aria-label='글 검색']", { state: "detached" });
  console.log("ok  : Esc로 검색창이 닫힌다");

  // Git 연동
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const gitEnv = { GIT_AUTHOR_NAME: "테스터", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "테스터", GIT_COMMITTER_EMAIL: "t@example.com" };
  Object.assign(process.env, gitEnv);
  const remote = path.join(ud, "remote.git");
  git(ud, "init", "--bare", "-b", "main", remote);

  await page.getByRole("button", { name: "Git 상태" }).click();
  await page.getByRole("button", { name: "git 저장소 만들기" }).click();
  await page.waitForSelector("ul[aria-label='변경된 파일']");
  assert(fs.existsSync(path.join(ws, ".git")), "Git 탭에서 저장소를 만들 수 있다");
  await page.screenshot({ path: path.join(OUT, "10-git-panel.png") });

  await page.fill("input[aria-label='커밋 메시지']", "첫 커밋");
  await page.getByRole("button", { name: "커밋", exact: true }).click();
  await page.waitForSelector("text=변경된 파일이 없어요", { timeout: 8000 });
  assert(git(ws, "log", "--format=%s") === "첫 커밋", "입력한 메시지로 커밋하고 변경 목록이 비워진다");
  await page.waitForSelector("button[aria-label='Git 상태']:has-text('main')");
  console.log("ok  : 사이드바 아래에 브랜치 상태가 보인다");

  await page.fill("input[aria-label='원격 저장소 주소']", remote);
  await page.getByRole("button", { name: "연결", exact: true }).click();
  await page.getByRole("button", { name: "동기화" }).click();
  await page.waitForSelector("text=동기화했어요", { timeout: 15000 });
  assert(execFileSync("git", ["--git-dir", remote, "log", "--format=%s", "main"], { encoding: "utf8" }).trim() === "첫 커밋", "동기화로 원격 저장소에 첫 푸시가 된다");

  // 글을 고치면 사이드바에 변경 점이 생기고, 커밋하면 사라진다
  await page.click("nav[aria-label='글 목록'] >> text=오늘");
  await page.waitForFunction(() => document.querySelector(".note-prose")?.textContent?.includes("오늘의 일기"));
  await page.click(".note-prose > p >> nth=0");
  await page.keyboard.press("End");
  await page.keyboard.type(" 추가");
  await page.waitForSelector("nav[aria-label='글 목록'] [aria-label='git 변경됨']", { timeout: 8000 });
  console.log("ok  : 고친 글에 변경 표시가 생긴다");
  await page.getByRole("button", { name: "커밋", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("nav[aria-label='글 목록'] [aria-label='git 변경됨']").length === 0, null, { timeout: 8000 });
  console.log("ok  : 커밋하면 변경 표시가 사라진다");
  await page.getByRole("button", { name: "푸시", exact: true }).click();
  await sleep(1500);

  // 다른 기기(B)의 변경 가져오기
  const clone = path.join(ud, "clone-b");
  git(ud, "clone", remote, clone);
  fs.writeFileSync(path.join(clone, "B가 만든 글.md"), "다른 기기에서 쓴 글\n");
  git(clone, "add", "-A");
  git(clone, "commit", "-m", "B에서 추가");
  git(clone, "push");
  await page.getByRole("button", { name: "가져오기" }).click();
  await page.waitForSelector("nav[aria-label='글 목록'] >> text=B가 만든 글", { timeout: 15000 });
  assert(fs.readFileSync(path.join(ws, "B가 만든 글.md"), "utf8") === "다른 기기에서 쓴 글\n", "원격의 새 글을 가져와 목록에 나타난다");

  // 충돌: 글은 그대로 두고 알려준다
  fs.writeFileSync(path.join(clone, "일기", "오늘.md"), "B 버전\n");
  git(clone, "commit", "-am", "B가 오늘 수정");
  git(clone, "push");
  fs.writeFileSync(path.join(ws, "일기", "오늘.md"), "A 버전\n");
  await sleep(800);
  await page.fill("input[aria-label='커밋 메시지']", "A가 오늘 수정");
  await page.getByRole("button", { name: "커밋", exact: true }).click();
  await sleep(1500);
  await page.getByRole("button", { name: "가져오기" }).click();
  await page.waitForSelector("text=합치지 못했어요", { timeout: 15000 });
  const mine = fs.readFileSync(path.join(ws, "일기", "오늘.md"), "utf8");
  assert(mine === "A 버전\n", `충돌해도 글에 충돌 표시가 남지 않고 내 버전이 그대로다 (${JSON.stringify(mine)})`);
  assert(git(ws, "status", "--porcelain") === "", "충돌 뒤에도 작업 폴더가 깨끗한 상태로 되돌아간다");
  await page.screenshot({ path: path.join(OUT, "11-git-conflict.png") });

  // 자동 커밋 설정은 컴퓨터별 설정 파일에 저장된다
  await page.locator("summary", { hasText: "자동화 설정" }).click();
  await page.selectOption("select[aria-label='자동 커밋 간격']", "10");
  await sleep(800);
  const gitSettings = JSON.parse(fs.readFileSync(path.join(ud, "git-settings.json"), "utf8"));
  assert(gitSettings[ws]?.autoCommitMinutes === 10, "자동 커밋 간격이 사용자 설정 파일에 저장된다");
  assert(!fs.existsSync(path.join(ws, ".handy-writer", "git-settings.json")), "컴퓨터별 설정은 작업 폴더(git) 안에 들어가지 않는다");
  await page.getByRole("button", { name: "Git 닫기" }).click();

  // 첨부 탭: 이미지와 영상 보기, 라벨과 크기 고치기
  const fixture = (name) => path.join(ROOT, "e2e", "fixtures", name);
  fs.mkdirSync(path.join(ws, "attachments"), { recursive: true });
  fs.copyFileSync(fixture("photo.png"), path.join(ws, "attachments", "사진 1.png"));
  fs.copyFileSync(fixture("clip.webm"), path.join(ws, "attachments", "영상.webm"));
  const attachNote = path.join(ws, "첨부 테스트.md");
  fs.writeFileSync(
    attachNote,
    "# 첨부 테스트\n\n![[사진 1.png|여행 사진|240]]\n\n![[영상.webm]]\n\n![없는 파일](attachments/missing.png)\n\n![](attachments/사진%201.png)\n",
  );
  await sleep(1200);
  await page.click("nav[aria-label='글 목록'] >> text=첨부 테스트");
  await page.waitForSelector(".note-prose [data-embed-view='image']");

  // 에디터 안에서 그려진 모습
  await page.waitForFunction(
    () => [...document.querySelectorAll(".note-prose .embed img")].every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll(".note-prose .embed img").length >= 2,
    null,
    { timeout: 8000 },
  );
  const shown = await page.evaluate(() => {
    const img = document.querySelector(".note-prose .embed img");
    const video = document.querySelector(".note-prose video");
    return {
      src: img?.getAttribute("src"),
      natural: img?.naturalWidth,
      width: Math.round(img?.getBoundingClientRect().width ?? 0),
      caption: document.querySelector(".note-prose .embed-caption")?.textContent,
      videoMeta: video ? { ready: video.readyState, w: video.videoWidth } : null,
      missing: document.querySelectorAll(".note-prose .embed-missing").length,
      embedCount: document.querySelectorAll(".note-prose .embed").length,
    };
  });
  assert(shown.src?.startsWith("handy-asset://vault/attachments/") && shown.natural === 120, `작업 폴더의 이미지가 handy-asset 프로토콜로 표시된다 (${shown.src})`);
  assert(shown.width === 240, `글에 적은 너비(240)대로 표시된다 (${shown.width}px)`);
  assert(shown.caption === "여행 사진", "라벨이 이미지 아래 캡션으로 보인다");
  assert(
    await page.evaluate(() => {
      const imgs = [...document.querySelectorAll(".note-prose .embed img")];
      const last = imgs[imgs.length - 1];
      return Math.abs(last.getBoundingClientRect().width - last.closest("p").getBoundingClientRect().width) <= 1;
    }),
    "크기를 적지 않은 이미지는 기본으로 글 폭 100%로 보인다",
  );
  assert(shown.missing === 1, "없는 파일은 '파일을 찾을 수 없어요'로 표시된다");
  await page.waitForFunction(() => (document.querySelector(".note-prose video")?.readyState ?? 0) >= 1, null, { timeout: 8000 });
  assert(await page.evaluate(() => document.querySelector(".note-prose video").videoWidth === 64), "영상 메타데이터를 읽어 재생할 수 있다");
  await page.screenshot({ path: path.join(OUT, "13-attachments-editor.png") });

  // 프로토콜 보안과 Range 요청 (화면의 fetch는 CSP로 막혀 있으므로, 같은 핸들러를 메인 프로세스에서 호출한다)
  const probe = await app.evaluate(async ({ net }) => {
    const get = async (url, headers) => {
      try {
        const r = await net.fetch(url, { headers });
        return { status: r.status, length: (await r.arrayBuffer()).byteLength, range: r.headers.get("content-range"), type: r.headers.get("content-type") };
      } catch (e) {
        return { status: "error", message: String(e) };
      }
    };
    return {
      whole: await get("handy-asset://vault/attachments/%EC%98%81%EC%83%81.webm"),
      range: await get("handy-asset://vault/attachments/%EC%98%81%EC%83%81.webm", { Range: "bytes=0-9" }),
      outOfRange: await get("handy-asset://vault/attachments/%EC%98%81%EC%83%81.webm", { Range: "bytes=999999-" }),
      traversal: await get("handy-asset://vault/..%2F..%2Fetc%2Fpasswd.png"),
      note: await get("handy-asset://vault/%EC%B2%A8%EB%B6%80%20%ED%85%8C%EC%8A%A4%ED%8A%B8.md"),
      other: await get("handy-asset://other/attachments/a.png"),
    };
  });
  assert(probe.whole.status === 200 && probe.whole.type === "video/webm" && probe.whole.length > 1000, `영상 전체 요청에 올바른 형식으로 답한다 (${JSON.stringify(probe.whole)})`);
  assert(probe.range.status === 206 && probe.range.length === 10 && /^bytes 0-9\//.test(probe.range.range), `영상 Range 요청에 206으로 일부만 답한다 (${JSON.stringify(probe.range)})`);
  assert(probe.outOfRange.status === 416, `범위를 벗어난 Range는 416이다 (${probe.outOfRange.status})`);
  assert(probe.traversal.status !== 200 && probe.note.status === 403 && probe.other.status === 404, `작업 폴더 밖, 글(.md), 다른 호스트는 열 수 없다 (${probe.traversal.status}/${probe.note.status}/${probe.other.status})`);

  // 패널: 처음에는 모두 접혀 있고, 눌러야 펼쳐진다
  await page.getByRole("tab", { name: /^첨부/ }).click();
  await page.waitForSelector("ul[aria-label='첨부 목록'] > li");
  assert((await page.locator("ul[aria-label='첨부 목록'] > li").count()) === 4, "첨부 탭에 이 글의 이미지, 영상, 없는 파일, 마크다운 이미지가 모두 나열된다");
  assert(
    (await page.locator("ul[aria-label='첨부 목록'] button[aria-expanded='true']").count()) === 0 && (await page.locator("input[aria-label='라벨']").count()) === 0,
    "첨부는 처음에 모두 접혀 있고 입력창이 보이지 않는다",
  );
  const card = page.locator("li[aria-label='사진 1.png']").first();
  assert((await card.innerText()).includes("여행 사진"), "접힌 줄에 파일 이름과 라벨이 보인다");
  await page.screenshot({ path: path.join(OUT, "14-attachments-collapsed.png") });

  await card.getByRole("button").first().click();
  assert((await card.locator("input[aria-label='라벨']").inputValue()) === "여행 사진", "펼치면 라벨을 고칠 수 있다");
  assert(!(await card.locator("input[aria-label='너비']").isVisible()), "기본 정보에는 라벨만 있고 크기 입력은 '크기 조정' 안에 접혀 있다");
  assert((await card.innerText()).includes("이미지") && (await card.innerText()).includes("120×80"), "종류와 원본 크기가 보인다");
  await card.locator("summary", { hasText: "크기 조정" }).click();
  assert((await card.locator("input[aria-label='너비']").inputValue()) === "240", "크기 조정을 열면 현재 너비가 채워진다");
  await page.screenshot({ path: path.join(OUT, "14-attachments-panel.png") });

  const noteText = () => fs.readFileSync(attachNote, "utf8");
  await card.locator("input[aria-label='라벨']").fill("새 여행 사진");
  await sleep(1800);
  assert(noteText().includes("![[사진 1.png|새 여행 사진|240]]"), "라벨을 고치면 글(.md)에 `![[파일|라벨|너비]]`로 저장된다");
  await card.locator("input[aria-label='너비']").fill("300");
  await sleep(1800);
  assert(noteText().includes("![[사진 1.png|새 여행 사진|300]]"), "너비를 고치면 글에 반영된다");
  assert((await page.evaluate(() => Math.round(document.querySelector(".note-prose .embed img").getBoundingClientRect().width))) === 300, "에디터의 이미지 크기도 바로 바뀐다");
  await card.getByRole("button", { name: /작게/ }).click();
  await sleep(1500);
  assert(noteText().includes("![[사진 1.png|새 여행 사진|200]]"), "프리셋(작게 200)을 누르면 너비가 200이 된다");
  await card.getByRole("button", { name: "기본값(100%)" }).click();
  await sleep(1500);
  assert(noteText().includes("![[사진 1.png|새 여행 사진]]"), "기본값(100%)을 누르면 크기 표시가 사라진다");
  assert(
    await page.evaluate(() => {
      const img = document.querySelector(".note-prose .embed img");
      return Math.abs(img.getBoundingClientRect().width - img.closest("p").getBoundingClientRect().width) <= 1;
    }),
    "크기를 정하지 않으면 이미지가 글 폭 100%로 보인다",
  );
  await card.locator("input[aria-label='너비']").fill("100");
  await sleep(1500);
  await card.getByRole("checkbox", { name: "비율 유지" }).uncheck();
  await sleep(1500);
  assert(noteText().includes("![[사진 1.png|새 여행 사진|100x67]]"), "비율 유지를 끄면 현재 비율의 높이(67)가 정해져 `100x67`로 저장된다");
  await card.locator("input[aria-label='높이']").fill("40");
  await sleep(1800);
  assert(noteText().includes("![[사진 1.png|새 여행 사진|100x40]]"), "높이를 직접 고칠 수 있다");

  await card.locator("input[aria-label='라벨']").fill("2024");
  await sleep(1000);
  assert((await card.getByText("숫자만으로는 라벨을 만들 수 없어요").count()) === 1 && noteText().includes("|새 여행 사진|"), "숫자만 있는 라벨은 거부하고 기존 라벨을 유지한다");

  const mdCard = page.locator("ul[aria-label='첨부 목록'] > li").nth(3);
  await mdCard.getByRole("button").first().click();
  await mdCard.locator("summary", { hasText: "크기 조정" }).click();
  await mdCard.locator("input[aria-label='라벨']").fill("마크다운 사진");
  await mdCard.locator("input[aria-label='너비']").fill("150");
  await sleep(1800);
  assert(noteText().includes("![마크다운 사진|150](attachments/사진%201.png)"), "일반 마크다운 이미지는 그 문법(`![라벨|너비](경로)`)을 유지한 채 고쳐진다");

  const missingCard = page.locator("li[aria-label='attachments/missing.png']");
  await missingCard.getByRole("button").first().click();
  await missingCard.getByRole("button", { name: /글에서 제거/ }).click();
  await sleep(1500);
  assert(!noteText().includes("missing.png") && (await page.locator("ul[aria-label='첨부 목록'] > li").count()) === 3, "글에서 제거하면 글과 목록에서 빠진다");
  assert(fs.existsSync(path.join(ws, "attachments", "사진 1.png")), "글에서 제거해도 파일은 삭제되지 않는다");

  // 첨부 추가 (파일 선택 창), 붙여넣기, 끌어다 놓기
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, [fixture("square.png")]);
  await page.click(".note-prose > p >> nth=0");
  await page.getByRole("button", { name: "첨부 추가" }).click();
  await page.waitForFunction(() => document.querySelectorAll("ul[aria-label='첨부 목록'] > li").length === 4, null, { timeout: 8000 });
  await sleep(1500);
  assert(fs.existsSync(path.join(ws, "attachments", "square.png")) && noteText().includes("![[square.png]]"), "첨부 추가: 파일이 attachments/ 로 복사되고 글에 임베드가 들어간다");
  assert(fs.existsSync(fixture("square.png")), "원본 파일은 그대로 남는다");
  await page.getByRole("button", { name: "첨부 추가" }).click();
  await sleep(2000);
  assert(fs.existsSync(path.join(ws, "attachments", "square 1.png")) && noteText().includes("![[square 1.png]]"), "같은 이름을 또 추가하면 `square 1.png`로 겹치지 않게 저장한다");

  const pngBase64 = fs.readFileSync(fixture("photo.png")).toString("base64");
  await page.click(".note-prose > p:last-of-type");
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "image.png", { type: "image/png" }));
    document.querySelector(".ProseMirror").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, pngBase64);
  await page.waitForFunction(() => document.querySelectorAll("ul[aria-label='첨부 목록'] > li").length === 6, null, { timeout: 8000 });
  await sleep(1500);
  const pasted = fs.readdirSync(path.join(ws, "attachments")).filter((n) => n.startsWith("Pasted image "));
  assert(pasted.length === 1 && noteText().includes(`![[${pasted[0]}]]`), `이미지를 붙여넣으면 'Pasted image 날짜.png'로 저장되고 글에 들어간다 (${pasted[0]})`);

  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "끌어온 그림.png", { type: "image/png" }));
    const rect = document.querySelector(".ProseMirror").getBoundingClientRect();
    document.querySelector(".ProseMirror").dispatchEvent(new DragEvent("drop", { dataTransfer: data, clientX: rect.left + 20, clientY: rect.top + 20, bubbles: true, cancelable: true }));
  }, pngBase64);
  await page.waitForFunction(() => document.querySelectorAll("ul[aria-label='첨부 목록'] > li").length === 7, null, { timeout: 8000 });
  await sleep(1500);
  assert(fs.existsSync(path.join(ws, "attachments", "끌어온 그림.png")) && noteText().includes("![[끌어온 그림.png]]"), "끌어다 놓은 파일은 원래 이름으로 저장되고 놓은 자리에 들어간다");

  await page.click(".note-prose > p:last-of-type");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/이미지");
  await page.waitForSelector("[role='listbox'] [role='option']:has-text('이미지·영상·파일')");
  console.log("ok  : 슬래시 메뉴에 '이미지·영상·파일'이 있다");
  await page.keyboard.press("Escape");

  assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.length ? JSON.stringify(logs) : ""}`);
  await app.close();
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(1); });
