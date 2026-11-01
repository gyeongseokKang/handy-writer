// 사이드바 아래 git 줄 옆의 동기화 버튼을 실제 앱과 로컬 원격 저장소로 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:git-sync`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const remote = fs.mkdtempSync(path.join(os.tmpdir(), "hw-remote-"));
const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=시험", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf8" });
git(remote, "init", "-q", "--bare", "-b", "main");

const env = await launchApp({
  open: "메모",
  files: { "메모.md": "처음 글\n" },
  setup: (ws) => {
    git(ws, "init", "-q", "-b", "main");
    git(ws, "config", "user.name", "시험");
    git(ws, "config", "user.email", "t@example.com");
    git(ws, "add", "-A");
    git(ws, "commit", "-q", "-m", "처음");
    git(ws, "remote", "add", "origin", remote);
    git(ws, "push", "-q", "-u", "origin", "main");
  },
});
const { page, ws, logs } = env;
const sync = page.getByRole("button", { name: "동기화", exact: true });
const waitFor = async (check, tries = 60) => {
  for (let i = 0; i < tries && !(await check()); i++) await sleep(150);
  return check();
};

// 올리거나 받을 것이 없으면 버튼이 없다.
await sleep(1800);
assert((await sync.count()) === 0, "바꾼 것이 없으면 동기화 버튼이 보이지 않는다");

// 글을 고치면(저장되면) 버튼이 나타난다.
await page.locator(".note-prose p").first().click();
await sleep(200);
await page.keyboard.press("End");
await sleep(200);
await page.keyboard.type(" 새로 쓴 문장");
assert(await waitFor(async () => (await sync.count()) === 1), "글을 고치면 동기화 버튼이 나타난다");
const title = (await sync.getAttribute("title")) ?? "";
assert(title.includes("변경 1개"), `버튼 설명에 바뀐 개수가 있다 (${title})`);
assert(await page.getByRole("button", { name: "Git 상태" }).isVisible(), "브랜치 줄은 그대로 있다");

// 누르면 커밋 → 가져오기 → 푸시까지 한다.
await sync.click();
assert(await waitFor(() => git(remote, "log", "--oneline", "main").trim().split("\n").length === 2), "누르면 커밋해서 원격에 올린다");
assert(git(remote, "show", "main:메모.md").includes("새로 쓴 문장"), "올라간 글에 고친 내용이 들어 있다");
assert(await waitFor(async () => (await sync.count()) === 0), "끝나면 버튼이 다시 사라진다");

// 커밋만 하고 올리지 않은 것(↑)도 버튼을 보여 준다.
git(ws, "commit", "-q", "--allow-empty", "-m", "올리지 않은 커밋");
await page.locator(".note-prose p").first().click();
await page.keyboard.press("End");
await sleep(200);
await page.keyboard.type("!");
assert(await waitFor(async () => (await sync.count()) === 1 && /올릴 것 1/.test((await sync.getAttribute("title")) ?? "")), "올리지 않은 커밋이 있으면 버튼이 나타난다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
