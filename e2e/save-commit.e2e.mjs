// Cmd/Ctrl+S: 지금 글(과 그 글의 첨부)만 커밋하고, 다른 글의 변경은 남겨 두며, 바뀐 게 없으면 커밋하지 않고, 푸시하지 않는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:save-commit`
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createReporter, launchApp, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const remote = fs.mkdtempSync(path.join(os.tmpdir(), "hw-remote-"));
const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=시험", "-c", "user.email=t@example.com", "-c", "core.quotepath=false", ...args], { cwd, encoding: "utf8" }).trim();
git(remote, "init", "-q", "--bare", "-b", "main");

const env = await launchApp({
  open: "메모",
  files: { "메모.md": "처음 글\n", "다른 글.md": "다른 글\n" },
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

// 다른 글은 밖에서 고쳐 둔다 (커밋에 들어가면 안 된다).
fs.writeFileSync(path.join(ws, "다른 글.md"), "다른 글을 고침\n");
await page.locator(".note-prose p").first().click();
await page.keyboard.press("End");
await page.keyboard.type(" 더 씀");
await page.keyboard.press("Control+s");
await sleep(1500);
assert(git(ws, "log", "-1", "--format=%s") === "글: 메모", `Ctrl+S로 지금 글을 '글: 제목'으로 커밋한다 (${git(ws, "log", "-1", "--format=%s")})`);
assert(git(ws, "show", "--name-only", "--format=", "HEAD") === "메모.md", "커밋에는 지금 글만 들어간다");
assert(git(ws, "show", "HEAD:메모.md").includes("처음 글 더 씀"), "막 쓴 내용까지 저장한 뒤 커밋한다");
assert(git(ws, "status", "--porcelain").includes("다른 글.md"), "다른 글의 변경은 그대로 남는다");
assert(git(ws, "rev-parse", "HEAD") !== git(remote, "rev-parse", "main"), "푸시는 하지 않는다");
assert((await page.getByText(/커밋했어요 \([0-9a-f]{7}\) · 메모/).count()) === 1, "커밋했다고 짧은 해시와 함께 알려 준다");

const before = git(ws, "rev-parse", "HEAD");
await page.keyboard.press("Control+s");
await sleep(1200);
assert(git(ws, "rev-parse", "HEAD") === before, "바뀐 게 없으면 커밋하지 않는다");
assert((await page.getByText("바뀐 게 없어서 커밋하지 않았어요").count()) === 1, "바뀐 게 없다고 알려 준다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
