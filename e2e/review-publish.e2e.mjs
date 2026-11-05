// 핸디 리뷰 다시 게시: 사이드바에서 글을 가져와 고치면 '다시 게시 필요'가 뜨고, 다시 게시를 누르면
// 이전과 바뀐 점(diff) 확인 창이 뜨며, 게시하면 저장소에 푸시되고 작업 폴더의 사본은 사라지는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:review-publish`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const base = fs.mkdtempSync(path.join(os.tmpdir(), "hw-review-"));
const remote = path.join(base, "remote.git");
const repo = path.join(base, "repo");
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd, ...args) => execFileSync("git", ["-c", "core.quotepath=false", ...args], { cwd, env }).toString().trim();
execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
execFileSync("git", ["clone", "-q", remote, repo], { env });
const post = "src/content/reviews/baby/2026-10-20-버터플라이.md";
fs.mkdirSync(path.join(repo, path.dirname(post)), { recursive: true });
fs.writeFileSync(path.join(repo, "src/content.config.ts"), "");
fs.writeFileSync(path.join(repo, post), "---\ntitle: 버터플라이\ncategory: baby\nrating: 4.5\nverdict: 가볍다\ntarget: 부모\ndate: 2026-10-20\ntags: [육아]\n---\n\n접기 쉬운 유모차.\n");
git(repo, "add", "-A"); git(repo, "commit", "-qm", "init"); git(repo, "push", "-q", "-u", "origin", "main");

const app = await launchApp({
  files: { "글.md": "다른 글\n" },
  open: "글",
  setup: (_ws, ud) => fs.writeFileSync(path.join(ud, "review-config.json"), JSON.stringify({ repo, deploy: { kind: "cloudflare-version-json", siteUrl: "http://127.0.0.1:9" } })),
});
const { page, ws, logs } = app;
const copy = path.join(ws, "리뷰", "버터플라이.md");

await page.getByRole("navigation", { name: "핸디 리뷰 글 목록" }).getByText("버터플라이").click();
await page.waitForSelector("#review-settings");
assert(fs.existsSync(copy), "사이드바에서 누르면 작업 폴더 '리뷰/'로 가져와 연다");
const section = page.locator("#review-settings");
assert((await section.getByRole("button", { name: "미리보기" }).count()) === 0, "미리보기 버튼이 없다");
assert((await section.getByText("사이트 빌드 중").count()) === 0 && (await section.getByLabel("배포 상태 다시 확인").count()) === 0, "빌드 상태 표시가 없다");
const sync = section.getByTestId("review-sync");
await sync.waitFor({ timeout: 8000 });
assert((await sync.innerText()).includes("원본과 같음"), `가져온 그대로면 '원본과 같음' (${await sync.innerText()})`);
assert(await section.getByRole("button", { name: "다시 게시" }).isDisabled(), "원본과 같으면 다시 게시 버튼이 꺼져 있다");

await section.getByPlaceholder("한 손으로 접히는 휴대성이 전부다.").fill("가볍고 접기 쉽다");
await page.waitForFunction(() => document.querySelector("[data-testid='review-sync']")?.textContent?.includes("다시 게시 필요"), null, { timeout: 10000 });
assert(true, "고치면 '다시 게시 필요'로 바뀐다");
await page.screenshot({ path: path.join(OUT, "review-sync.png") });

await section.getByRole("button", { name: "다시 게시" }).click();
const dialog = page.getByRole("dialog", { name: "다시 게시 확인" });
await dialog.waitFor();
assert((await dialog.locator("del").filter({ hasText: "가볍" }).count()) + (await dialog.locator("ins").filter({ hasText: "접기 쉽" }).count()) >= 1, "확인 창에 이전과 바뀐 점이 diff로 보인다");
await page.screenshot({ path: path.join(OUT, "review-publish-diff.png") });
await dialog.getByRole("button", { name: "다시 게시" }).click();
await dialog.waitFor({ state: "detached", timeout: 30000 });
await sleep(800);
assert(fs.readFileSync(path.join(repo, post), "utf8").includes("verdict: 가볍고 접기 쉽다"), "저장소 글이 고친 내용으로 바뀐다");
assert(git(repo, "rev-parse", "HEAD") === git(remote, "rev-parse", "main"), "원격에 푸시된다");
assert(!fs.existsSync(copy), "게시하면 작업 폴더의 사본은 사라진다(휴지통)");
assert((await page.getByRole("navigation", { name: "글 목록", exact: true }).getByText("버터플라이").count()) === 0, "글 목록에서도 사라진다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await app.close();
