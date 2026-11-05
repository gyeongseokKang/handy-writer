import { describe, expect, it } from "vitest";
import { cleanFrontmatter, decideDeployState, reviewTemplate, slugify } from "./review";

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
