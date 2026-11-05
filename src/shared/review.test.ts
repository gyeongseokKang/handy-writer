import { describe, expect, it } from "vitest";
import { cleanFrontmatter, dashboardPostState, decideDeployState, parseGitHubRemote, reviewTemplate, slugify, summarizeChecks } from "./review";

describe("review", () => {
  it("makes a post path from category, date and slug", () => {
    const post = reviewTemplate("baby", "부가부 버터플라이 3개월", "2026-11-02");
    expect(post.path).toBe("src/content/reviews/baby/2026-11-02-부가부-버터플라이-3개월.md");
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
  it("drops empty optional fields and clamps rating", () => {
    const fm = cleanFrontmatter({ ...reviewTemplate("place", "x").frontmatter, rating: 7, pros: ["a", " "], address: "" });
    expect(fm["rating"]).toBe(5);
    expect(fm["pros"]).toEqual(["a"]);
    expect("address" in fm).toBe(false);
  });
  it("decides deploy state", () => {
    expect(decideDeployState({ deployedSha: "abc1234", remoteSha: "abc1234ffff", localSha: "abc1234ffff" }).state).toBe("up-to-date");
    expect(decideDeployState({ deployedSha: "aaa", remoteSha: "bbb", localSha: "bbb" }).state).toBe("deploy-needed");
    expect(decideDeployState({ deployedSha: "aaa", remoteSha: "bbb", localSha: "ccc" }).state).toBe("unpushed");
    expect(decideDeployState({ deployedSha: null, remoteSha: "bbb", localSha: "bbb" }).state).toBe("unknown");
    // 받을 커밋만 있고(뒤처짐) 올릴 커밋이 없으면 푸시 안 함이 아니라 원격·배포본으로 판단한다
    expect(decideDeployState({ deployedSha: "bbb", remoteSha: "bbb", localSha: "old", localAhead: 0 }).state).toBe("up-to-date");
    expect(decideDeployState({ deployedSha: "aaa", remoteSha: "bbb", localSha: "old", localAhead: 0 }).state).toBe("deploy-needed");
    expect(decideDeployState({ deployedSha: "bbb", remoteSha: "bbb", localSha: "new", localAhead: 2 }).state).toBe("unpushed");
  });
});

describe("deploy dashboard helpers", () => {
  it("decides a review's state", () => {
    const base = { hasNote: true, inRepo: true, problems: 0, differs: false, onRemote: true, deployed: true };
    expect(dashboardPostState(base)).toBe("live");
    expect(dashboardPostState({ ...base, deployed: false })).toBe("pending");
    expect(dashboardPostState({ ...base, deployed: null })).toBe("published");
    expect(dashboardPostState({ ...base, onRemote: false })).toBe("unpushed");
    expect(dashboardPostState({ ...base, differs: true })).toBe("changed");
    expect(dashboardPostState({ ...base, differs: true, problems: 1 })).toBe("blocked");
    expect(dashboardPostState({ ...base, inRepo: false })).toBe("draft");
    expect(dashboardPostState({ ...base, inRepo: false, problems: 2 })).toBe("blocked");
    // 작업 폴더에 없는 저장소 글은 다른지 비교하지 않는다
    expect(dashboardPostState({ ...base, hasNote: false, differs: true })).toBe("live");
  });

  it("summarizes check runs", () => {
    expect(summarizeChecks([])).toBeNull();
    expect(summarizeChecks([{ status: "completed", conclusion: "success", details_url: "u1" }])).toEqual({ build: "success", url: "u1" });
    expect(summarizeChecks([{ status: "completed", conclusion: "success" }, { status: "in_progress", html_url: "u2" }])).toEqual({ build: "pending", url: "u2" });
    expect(summarizeChecks([{ status: "in_progress" }, { status: "completed", conclusion: "failure", details_url: "u3" }])).toEqual({ build: "failure", url: "u3" });
    expect(summarizeChecks([{ status: "completed", conclusion: "skipped" }])?.build).toBe("success");
  });

  it("reads GitHub owner/repo from a remote url", () => {
    expect(parseGitHubRemote("git@github.com:gyeongseokKang/handy-review.git")).toEqual({ owner: "gyeongseokKang", repo: "handy-review" });
    expect(parseGitHubRemote("https://github.com/gyeongseokKang/handy-review")).toEqual({ owner: "gyeongseokKang", repo: "handy-review" });
    expect(parseGitHubRemote("https://gitlab.com/a/b.git")).toBeNull();
  });
});
