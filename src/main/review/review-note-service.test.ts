import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { readReviewMeta, writeReviewMeta } from "../../shared/review-note";
import { splitFrontmatter } from "../../shared/frontmatter";

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() }, net: { fetch } }));
const { importReviewToNote, previewNoteReview, publishNoteReview } = await import("./review-note-service");

const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "core.quotepath=false", ...args], { cwd, env }).toString().trim();

function setup() {
  const base = mkdtempSync(join(tmpdir(), "hrn-"));
  const remote = join(base, "remote.git");
  const repo = join(base, "repo");
  const ws = join(base, "ws");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["clone", "-q", remote, repo]);
  git(repo, "config", "user.name", "t"); git(repo, "config", "user.email", "t@t");
  mkdirSync(join(repo, "src/content/reviews/baby"), { recursive: true });
  writeFileSync(join(repo, "src/content.config.ts"), "");
  writeFileSync(join(repo, "src/content/reviews/baby/2026-10-20-bugaboo-butterfly.md"), "---\ntitle: 버터플라이\ncategory: baby\nrating: 4.5\nverdict: 가볍다\ntarget: 부모\ndate: 2026-10-20\ntags: [육아]\n---\n\n본문 ![](./2026-10-20-bugaboo-butterfly/a.png)\n");
  mkdirSync(join(repo, "src/content/reviews/baby/2026-10-20-bugaboo-butterfly"));
  writeFileSync(join(repo, "src/content/reviews/baby/2026-10-20-bugaboo-butterfly/a.png"), "png");
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "init"); git(repo, "push", "-q", "-u", "origin", "main");
  mkdirSync(join(ws, "attachments"), { recursive: true });
  writeFileSync(join(ws, "attachments", "접은 모습.png"), "img");
  writeFileSync(join(ws, "attachments", "표지.jpg"), "cover");
  return { repo, ws };
}

const fm = (meta: Record<string, unknown>) => writeReviewMeta("---\ntags: [육아, 유모차]\n---\n", { category: "baby", rating: 4, verdict: "", target: "", pros: [], cons: [], links: [], ...meta });

describe("publish a note as a review", () => {
  it("previews, publishes images and cover, re-publishes to a moved path, and keeps other files alone", async () => {
    const { repo, ws } = setup();
    writeFileSync(join(ws, "유모차 리뷰.md"), `${fm({ cover: "표지.jpg" })}\n# 유모차 리뷰\n\n![[접은 모습.png|접은 모습]]\n\n[[버터플라이]] 와 비교\n`);
    writeFileSync(join(repo, "untouched.txt"), "다른 변경");

    const preview = await previewNoteReview(ws, repo, "유모차 리뷰.md");
    expect(preview.path).toMatch(/^src\/content\/reviews\/baby\/\d{4}-\d{2}-\d{2}-유모차-리뷰\.md$/);
    expect(existsSync(join(repo, preview.path))).toBe(false);
    await expect(publishNoteReview(ws, repo, "유모차 리뷰.md")).rejects.toThrow("한 줄 결론");

    writeFileSync(join(ws, "유모차 리뷰.md"), `${fm({ cover: "표지.jpg", verdict: "접기 쉽다", target: "부모", slug: "light-stroller", date: "2026-11-02" })}\n# 유모차 리뷰\n\n![[접은 모습.png|접은 모습]]\n`);
    const r = await publishNoteReview(ws, repo, "유모차 리뷰.md");
    expect(r.path).toBe("src/content/reviews/baby/2026-11-02-light-stroller.md");
    expect(r.committed).toBe(true);
    expect(git(repo, "rev-parse", "origin/main")).toBe(r.sha);
    const text = readFileSync(join(repo, r.path), "utf8");
    expect(text).toContain("title: 유모차 리뷰");
    expect(text).toContain("tags: [육아, 유모차]");
    expect(text).toContain("cover: /images/reviews/light-stroller/cover.jpg");
    expect(text).toContain("![접은 모습](./2026-11-02-light-stroller/image.png)");
    expect(text).not.toContain("# 유모차 리뷰");
    expect(readFileSync(join(repo, "src/content/reviews/baby/2026-11-02-light-stroller/image.png"), "utf8")).toBe("img");
    expect(existsSync(join(repo, "public/images/reviews/light-stroller/cover.jpg"))).toBe(true);
    expect(git(repo, "status", "--porcelain")).toBe("?? untouched.txt");
    expect(r.meta).toMatchObject({ slug: "light-stroller", date: "2026-11-02", published: r.path });

    // 분류를 바꾸면 예전 경로를 지우고 새 경로로 옮긴다.
    writeFileSync(join(ws, "유모차 리뷰.md"), `${writeReviewMeta("---\ntags: [육아]\n---\n", { ...r.meta, category: "etc" })}\n본문만\n`);
    const moved = await publishNoteReview(ws, repo, "유모차 리뷰.md");
    expect(moved.replaces).toBe(r.path);
    expect(existsSync(join(repo, r.path))).toBe(false);
    expect(existsSync(join(repo, "src/content/reviews/baby/2026-11-02-light-stroller"))).toBe(false);
    const changed = git(repo, "show", "--name-status", "--format=", "HEAD");
    expect(changed).toMatch(/R\d+\tsrc\/content\/reviews\/baby\/2026-11-02-light-stroller\.md\tsrc\/content\/reviews\/etc\/2026-11-02-light-stroller\.md/);
    expect(changed).toContain("D\tsrc/content/reviews/baby/2026-11-02-light-stroller/image.png");
  });

  it("imports a site review as a note and finds it again instead of importing twice", async () => {
    const { repo, ws } = setup();
    const post = "src/content/reviews/baby/2026-10-20-bugaboo-butterfly.md";
    const first = await importReviewToNote(ws, repo, post);
    expect(first).toEqual({ path: "리뷰/버터플라이.md", created: true });
    const raw = readFileSync(join(ws, first.path), "utf8");
    expect(raw).toContain("![[a.png]]");
    const meta = readReviewMeta(splitFrontmatter(raw).frontmatter);
    expect(meta).toMatchObject({ category: "baby", rating: 4.5, verdict: "가볍다", published: post, slug: "bugaboo-butterfly", date: "2026-10-20" });
    expect(existsSync(join(ws, "attachments", "a.png"))).toBe(true);
    expect(await importReviewToNote(ws, repo, post)).toEqual({ path: first.path, created: false });

    // 가져온 글을 그대로 다시 게시하면 같은 파일을 고친다.
    const again = await publishNoteReview(ws, repo, first.path);
    expect(again.path).toBe(post);
    expect(again.replaces).toBeNull();
    // 내용이 그대로면 업데이트 날짜를 남기지 않고, 바꾸면 오늘 날짜가 붙는다.
    expect(again.meta.updated).toBeUndefined();
    expect(readFileSync(join(repo, post), "utf8")).not.toContain("updated:");
    writeFileSync(join(ws, first.path), readFileSync(join(ws, first.path), "utf8").replace(/\n*$/, "\n\n3개월 더 써 보니 바퀴가 닳았어요.\n"));
    const changed = await publishNoteReview(ws, repo, first.path);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(changed.meta.updated).toBe(today);
    expect(readFileSync(join(repo, post), "utf8")).toContain(`updated: ${today}`);
    // 다시 그대로 게시하면 업데이트 날짜를 그대로 둔다.
    writeFileSync(join(ws, first.path), writeReviewMeta(splitFrontmatter(readFileSync(join(ws, first.path), "utf8")).frontmatter, changed.meta) + "\n" + splitFrontmatter(readFileSync(join(ws, first.path), "utf8")).body);
    expect((await publishNoteReview(ws, repo, first.path)).meta.updated).toBe(today);
  });
});
