import { describe, expect, it } from "vitest";

import { serializeNote, splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter / serializeNote", () => {
  it("옵시디언 형식의 파일을 바이트 그대로 되돌린다", () => {
    const raw = "---\ntitle: 테스트\ntags: [a, b]\n---\n\n# 제목\n\n본문\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe("---\ntitle: 테스트\ntags: [a, b]\n---\n");
    expect(body).toBe("# 제목\n\n본문\n");
    expect(serializeNote(frontmatter, body)).toBe(raw);
  });

  it("frontmatter가 없으면 본문 전체를 돌려준다", () => {
    const { frontmatter, body } = splitFrontmatter("# 제목\n\n---\n\n끝\n");
    expect(frontmatter).toBe("");
    expect(body).toBe("# 제목\n\n---\n\n끝\n");
  });

  it("본문 중간의 구분선은 frontmatter로 보지 않는다", () => {
    expect(splitFrontmatter("글\n---\na: 1\n---\n").frontmatter).toBe("");
  });

  it("frontmatter만 있는 파일과 빈 frontmatter를 다룬다", () => {
    expect(splitFrontmatter("---\na: 1\n---\n")).toEqual({ frontmatter: "---\na: 1\n---\n", body: "" });
    expect(splitFrontmatter("---\n---\n본문").frontmatter).toBe("---\n---\n");
  });

  it("본문을 지우면 frontmatter만 남기고, 전부 비면 빈 파일이 된다", () => {
    expect(serializeNote("---\na: 1\n---\n", "")).toBe("---\na: 1\n---\n");
    expect(serializeNote("", "")).toBe("");
    expect(serializeNote("", "\n\n")).toBe("");
  });

  it("끝의 공백 줄을 줄바꿈 하나로 정리한다", () => {
    expect(serializeNote("", "글\n\n\n")).toBe("글\n");
  });
});
