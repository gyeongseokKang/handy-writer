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
  });
});
