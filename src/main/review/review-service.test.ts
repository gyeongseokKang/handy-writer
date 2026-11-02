import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, net: { fetch } }));

const { createPost, deployStatus, listPosts, parsePost, publishPost, readPost, saveImage, serializePost, writePost } = await import("./review-service");

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString().trim();

function setup() {
  const base = mkdtempSync(join(tmpdir(), "hr-"));
  const remote = join(base, "remote.git");
  const repo = join(base, "repo");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, repo]);
  git(repo, "config", "user.name", "t"); git(repo, "config", "user.email", "t@t");
  mkdirSync(join(repo, "src/content/reviews"), { recursive: true });
  writeFileSync(join(repo, "src/content.config.ts"), "");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "init"); git(repo, "push", "-q", "-u", "origin", "main");
  return { repo };
}

describe("review-service", () => {
  it("round-trips frontmatter", () => {
    const text = serializePost({ title: "t", category: "book", rating: 4.5, verdict: "v", pros: ["a"], cons: [], target: "x", links: [{ label: "쿠팡", url: "https://coupang.com", affiliate: true }], date: "2026-11-02", tags: ["책"] }, "본문");
    const post = parsePost("p.md", text);
    expect(post.frontmatter.rating).toBe(4.5);
    expect(post.frontmatter.links[0]!.affiliate).toBe(true);
    expect(post.body.trim()).toBe("본문");
  });

  it("creates, edits, adds an image and publishes to the remote", async () => {
    const { repo } = setup();
    const post = await createPost(repo, "baby", "유모차 리뷰");
    const rel = await saveImage(repo, post.path, "사진.png", new Uint8Array([1, 2, 3]));
    expect(rel).toMatch(/^\.\/\d{4}-\d{2}-\d{2}-유모차-리뷰\/사진\.png$/);
    await writePost(repo, { ...post, frontmatter: { ...post.frontmatter, verdict: "좋다", target: "부모" }, body: `![](${rel})` });
    expect((await readPost(repo, post.path)).frontmatter.verdict).toBe("좋다");
    expect((await listPosts(repo)).length).toBe(1);
    const r = await publishPost(repo, post.path);
    expect(r.committed).toBe(true);
    expect(git(repo, "rev-parse", "origin/main")).toBe(r.sha);
    expect(git(repo, "-c", "core.quotepath=false", "show", "--name-only", "--format=", "HEAD")).toContain("사진.png");
    expect(readFileSync(join(repo, post.path), "utf8")).toContain("verdict: 좋다");

    const status = await deployStatus(repo, null);
    expect(status.state).toBe("unknown");
    expect(status.remoteSha).toBe(r.sha);
  });
});
