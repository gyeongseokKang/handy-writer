import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { readReviewMeta, writeReviewMeta } from "../../shared/review-note";
import { splitFrontmatter } from "../../shared/frontmatter";

const deployed = { sha: "", builtAt: "2026-11-01T00:00:00Z" };
const fetchMock = vi.fn(async () => new Response(JSON.stringify(deployed), { status: 200 }));
vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, net: { fetch: fetchMock } }));
const { parseCommitLog, parsePathLog, reviewDashboard } = await import("./dashboard");
const { publishNoteReviewAndRecord } = await import("./review-note-service");

const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "core.quotepath=false", ...args], { cwd, env }).toString().trim();

function setup() {
  const base = mkdtempSync(join(tmpdir(), "hrd-"));
  const remote = join(base, "remote.git");
  const repo = join(base, "repo");
  const ws = join(base, "ws");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, repo]);
  git(repo, "config", "user.name", "t"); git(repo, "config", "user.email", "t@t");
  mkdirSync(join(repo, "src/content/reviews/baby"), { recursive: true });
  writeFileSync(join(repo, "src/content.config.ts"), "");
  writeFileSync(join(repo, "src/content/reviews/baby/2026-10-20-버터플라이.md"), "---\ntitle: 버터플라이\ncategory: baby\nrating: 4.5\nverdict: 가볍다\ntarget: 부모\ndate: 2026-10-20\ntags: [육아]\n---\n\n본문\n");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "init"); git(repo, "push", "-q", "-u", "origin", "main");
  mkdirSync(ws, { recursive: true });
  return { repo, ws };
}

const fm = (meta: Record<string, unknown>) => writeReviewMeta("---\ntags: [육아]\n---\n", { category: "baby", rating: 4, verdict: "", target: "", pros: [], cons: [], links: [], ...meta });
const info = { kind: "cloudflare-version-json" as const, siteUrl: "https://review.example.com" };

describe("review dashboard", () => {
  it("tells which reviews are live, waiting for the site, changed after publishing, or blocked", async () => {
    const { repo, ws } = setup();
    deployed.sha = git(repo, "rev-parse", "HEAD");

    writeFileSync(join(ws, "유모차.md"), `${fm({ verdict: "접기 쉽다", target: "부모", slug: "stroller", date: "2026-11-02" })}\n본문\n`);
    writeFileSync(join(ws, "빈 리뷰.md"), `${fm({})}\n본문\n`);

    let d = await reviewDashboard(ws, repo, info);
    expect(d.status.state).toBe("up-to-date");
    expect(d.status.deployedAt).toBe("2026-11-01T00:00:00Z");
    const by = (title: string) => d.posts.find((p) => p.title === title);
    expect(by("버터플라이")).toMatchObject({ state: "live", notePath: null, slug: "버터플라이" });
    expect(by("유모차")).toMatchObject({ state: "draft", postPath: null });
    expect(by("빈 리뷰")?.state).toBe("blocked");
    expect(by("빈 리뷰")?.problems.length).toBeGreaterThan(0);

    // 게시하면 글 파일에도 게시 정보가 적히고, 사이트가 아직 예전 커밋이면 '반영 대기'
    const r = await publishNoteReviewAndRecord(ws, repo, "유모차.md");
    const meta = readReviewMeta(splitFrontmatter(readFileSync(join(ws, "유모차.md"), "utf8")).frontmatter);
    expect(meta?.published).toBe(r.path);
    expect(readFileSync(join(ws, "유모차.md"), "utf8")).toContain("\n본문\n");
    d = await reviewDashboard(ws, repo, info);
    expect(d.status.state).toBe("deploy-needed");
    expect(by("유모차")).toMatchObject({ state: "pending", postPath: r.path, commitSha: r.sha, slug: "stroller" });
    expect(by("버터플라이")?.state).toBe("live");
    expect(d.commits.map((c) => c.deployed)).toEqual([false, true]);
    expect(d.buildCheck).toBe("unavailable");

    // 사이트가 새 커밋으로 빌드되면 반영됨, 글을 고치면 '수정 후 미게시'
    deployed.sha = r.sha;
    writeFileSync(join(ws, "유모차.md"), readFileSync(join(ws, "유모차.md"), "utf8").replace("본문", "고친 본문"));
    d = await reviewDashboard(ws, repo, info);
    expect(by("유모차")?.state).toBe("changed");

    // 저장소 파일을 손으로 고치고 커밋만 했으면 '푸시 안 됨'
    writeFileSync(join(repo, "src/content/reviews/baby/2026-10-20-버터플라이.md"), "---\ntitle: 버터플라이\ncategory: baby\nrating: 4\nverdict: 가볍다\ntarget: 부모\ndate: 2026-10-20\n---\n\n본문\n");
    git(repo, "commit", "-qam", "고침");
    d = await reviewDashboard(ws, repo, info);
    expect(by("버터플라이")?.state).toBe("unpushed");
  });

  it("parses git logs", () => {
    const log = parsePathLog("\x1eb\x1f2026-11-02\n\nsrc/a.md\nsrc/b.md\n\x1ea\x1f2026-11-01\n\nsrc/a.md\nsrc/c.md\n");
    expect(log.get("src/a.md")).toEqual({ sha: "b", date: "2026-11-02" });
    expect(log.get("src/c.md")?.sha).toBe("a");
    expect(parseCommitLog("abc\x1f리뷰: 제목\x1f2026-11-02\n")).toEqual([{ sha: "abc", subject: "리뷰: 제목", date: "2026-11-02" }]);
  });
});
