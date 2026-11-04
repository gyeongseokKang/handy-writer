import { describe, expect, it } from "vitest";

import {
  coupangLinkKind, defaultReviewMeta, nextUpdated, noteBodyToReview, readReviewMeta, reviewBodyToNote, reviewFrontmatterOf, reviewProblems, reviewSummary, reviewWarnings, slugOfReviewPath, sortSeries, writeReviewMeta,
} from "./review-note";

const ctx = {
  title: "유모차 리뷰",
  asset: (t: string) => (t.includes("없는") ? null : `./dir/${t.replace(/ /g, "-")}`),
  linkSlug: (name: string) => (name === "버터플라이" ? "bugaboo-butterfly" : null),
  embedNote: (t: string) => (t === "다른 글#요약" ? "요약 내용" : null),
};

describe("review meta in frontmatter", () => {
  it("treats a bare `review` property (and `review: 책`) as a review with defaults", () => {
    expect(readReviewMeta("---\nstatus: draft\n---\n")).toBeNull();
    expect(readReviewMeta("---\nreview:\n---\n")?.category).toBe("etc");
    expect(readReviewMeta("---\nreview: 책\n---\n")?.category).toBe("book");
    expect(readReviewMeta("---\nreview: tech\n---\n")?.category).toBe("tech");
  });

  it("writes review under one key and keeps other properties, order and comments", () => {
    const before = "---\n# 메모\nstatus: draft\ntags: [육아]\n---\n";
    const meta = { ...defaultReviewMeta("baby"), rating: 4.5, verdict: "좋다", target: "부모", pros: ["가볍다"], links: [{ label: "쿠팡", url: "https://coupang.com", affiliate: true }] };
    const after = writeReviewMeta(before, meta);
    expect(after).toContain("# 메모\nstatus: draft\ntags: [육아]\nreview:\n");
    expect(readReviewMeta(after)).toMatchObject({ category: "baby", rating: 4.5, verdict: "좋다", pros: ["가볍다"], links: [{ affiliate: true }] });
    expect(reviewSummary(after)).toBe("육아용품 · ★4.5 · 게시 전");
    expect(writeReviewMeta(after, null)).toBe("---\n# 메모\nstatus: draft\ntags: [육아]\n---\n");
    expect(writeReviewMeta("", null)).toBe("");
  });

  it("lists what blocks publishing", () => {
    expect(reviewProblems(defaultReviewMeta())).toEqual(["한 줄 결론을 적어 주세요.", "추천 대상을 적어 주세요."]);
    expect(reviewProblems({ ...defaultReviewMeta(), verdict: "v", target: "t", links: [{ label: "", url: "coupang", affiliate: false }] })).toHaveLength(1);
  });
});

describe("note body → review body", () => {
  it("drops the title heading, converts embeds, links, callouts and block ids", () => {
    const body = [
      "# 유모차 리뷰",
      "",
      "> [!tip] 한 줄 팁",
      "> 접기 쉽다",
      "",
      "![[사진 1.png|접은 모습|300]] ![[영상.mp4]]",
      "",
      "![작은 사진|200](attachments/b.png) ![](https://example.com/c.jpg)",
      "",
      "[[버터플라이]]와 [[버터플라이|이 유모차]], [[모르는 글]], [[모르는 글|별칭]], [[#^fig-a]] ^fig-a",
      "",
      "![[다른 글#요약]] ![[없는.png]]",
      "",
      "`![[코드.png]]` 그대로",
      "",
      "```md",
      "![[코드블록.png]] [[링크]]",
      "```",
    ].join("\n");
    const { body: out, warnings } = noteBodyToReview(body, ctx);
    expect(out).not.toContain("# 유모차 리뷰");
    expect(out).toContain("> **한 줄 팁**\n> 접기 쉽다");
    expect(out).toContain("![접은 모습](./dir/사진-1.png) [영상.mp4](./dir/영상.mp4)");
    expect(out).toContain("![작은 사진](./dir/attachments/b.png) ![](https://example.com/c.jpg)");
    expect(out).toContain("[[bugaboo-butterfly|버터플라이]]와 [[bugaboo-butterfly|이 유모차]], 모르는 글, 별칭, \n");
    expect(out).toContain("요약 내용 \n");
    expect(out).toContain("`![[코드.png]]` 그대로");
    expect(out).toContain("```md\n![[코드블록.png]] [[링크]]\n```");
    expect(warnings).toEqual(["첨부를 찾지 못해 뺐어요: 없는.png"]);
  });

  it("keeps a first heading that is not the title", () => {
    expect(noteBodyToReview("# 다른 제목\n\n본문", ctx).body).toBe("# 다른 제목\n\n본문\n");
  });
});

describe("review → note (import)", () => {
  it("turns relative images into attachment embeds and slugs into note links", () => {
    const out = reviewBodyToNote("![접은 모습](./2026-x/a.png) ![](https://x.com/b.png) [[bugaboo-butterfly]] [[unknown|글자]]", {
      image: (rel) => (rel === "./2026-x/a.png" ? "a.png" : null),
      noteName: (slug) => (slug === "bugaboo-butterfly" ? "버터플라이" : null),
    });
    expect(out).toBe("![[a.png|접은 모습]] ![](https://x.com/b.png) [[버터플라이]] 글자");
  });

  it("reads the slug from a published path like the site does", () => {
    expect(slugOfReviewPath("src/content/reviews/baby/2026-10-20-bugaboo-butterfly.md")).toBe("bugaboo-butterfly");
  });
});

describe("series", () => {
  it("reads, writes and publishes series fields", () => {
    const fm = writeReviewMeta("", { ...defaultReviewMeta("baby"), series: "유모차 3종 비교", seriesOrder: 2 });
    expect(readReviewMeta(fm)).toMatchObject({ series: "유모차 3종 비교", seriesOrder: 2 });
    const site = reviewFrontmatterOf({ ...readReviewMeta(fm)!, verdict: "v", target: "t" }, "제목", [], "2026-11-02", undefined);
    expect(site).toMatchObject({ series: "유모차 3종 비교", seriesOrder: 2 });
    expect(reviewFrontmatterOf({ ...defaultReviewMeta(), seriesOrder: 3 }, "t", [], "2026-11-02", undefined)).not.toHaveProperty("seriesOrder");
  });

  it("orders a series by order, then date, then name", () => {
    const e = (name: string, order: number | null, date: string | null) => ({ series: "s", path: `${name}.md`, name, order, date, published: false });
    expect(sortSeries([e("다", null, "2026-01-01"), e("나", 2, null), e("가", 1, null), e("라", null, "2025-01-01")]).map((x) => x.name)).toEqual(["가", "나", "라", "다"]);
  });
});

describe("coupang links", () => {
  it("tells partners links from plain coupang addresses", () => {
    expect(coupangLinkKind("https://link.coupang.com/a/bXyZ12")).toBe("partners");
    expect(coupangLinkKind("https://link.coupang.com/re/AFFSDP?lptag=AF123")).toBe("partners");
    expect(coupangLinkKind("https://coupa.ng/cdEfGh")).toBe("partners");
    expect(coupangLinkKind("https://www.coupang.com/vp/products/123?itemId=4")).toBe("product");
    expect(coupangLinkKind("https://m.coupang.com/vm/products/123")).toBe("product");
    expect(coupangLinkKind("https://example.com/coupang")).toBeNull();
    expect(coupangLinkKind("쿠팡")).toBeNull();
  });

  it("warns about plain coupang links and always marks partners links as affiliate when publishing", () => {
    const meta = { ...defaultReviewMeta(), verdict: "v", target: "t", links: [
      { label: "쿠팡", url: "https://www.coupang.com/vp/products/1", affiliate: true },
      { label: "파트너스", url: "https://link.coupang.com/a/abc", affiliate: false },
      { label: "공식", url: "https://example.com", affiliate: false },
    ] };
    expect(reviewWarnings(meta)).toHaveLength(1);
    expect(reviewWarnings(meta)[0]).toContain("‘쿠팡’");
    const site = reviewFrontmatterOf(meta, "t", [], "2026-11-04", undefined);
    expect(site.links.map((l) => l.affiliate)).toEqual([true, true, false]);
  });
});

describe("updated date", () => {
  const fm = (extra: Partial<ReturnType<typeof reviewFrontmatterOf>> = {}) => ({ ...reviewFrontmatterOf({ ...defaultReviewMeta("baby"), verdict: "v", target: "t" }, "제목", ["육아"], "2026-11-01", undefined), ...extra });
  it("is today when content changed, kept when unchanged, and never on first publish or the review day", () => {
    expect(nextUpdated({ previous: null, next: { frontmatter: fm(), body: "a" }, today: "2026-11-04" })).toBeUndefined();
    expect(nextUpdated({ previous: { frontmatter: fm(), body: "a" }, next: { frontmatter: fm(), body: "a\n" }, today: "2026-11-04" })).toBeUndefined();
    expect(nextUpdated({ previous: { frontmatter: fm(), body: "a" }, next: { frontmatter: fm(), body: "b" }, today: "2026-11-04" })).toBe("2026-11-04");
    expect(nextUpdated({ previous: { frontmatter: fm({ updated: "2026-11-03" }), body: "a" }, next: { frontmatter: fm(), body: "a" }, today: "2026-11-04" })).toBe("2026-11-03");
    expect(nextUpdated({ previous: { frontmatter: fm(), body: "a" }, next: { frontmatter: fm({ rating: 3 }), body: "a" }, today: "2026-11-04" })).toBe("2026-11-04");
    expect(nextUpdated({ previous: { frontmatter: fm(), body: "a" }, next: { frontmatter: fm(), body: "b" }, today: "2026-11-01" })).toBeUndefined();
  });

  it("ignores defaults the site parser fills in (empty address etc.)", () => {
    expect(nextUpdated({ previous: { frontmatter: { ...fm(), address: "", featured: false } as never, body: "a" }, next: { frontmatter: fm(), body: "a" }, today: "2026-11-04" })).toBeUndefined();
  });
});
