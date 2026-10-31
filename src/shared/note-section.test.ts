import { describe, expect, it } from "vitest";

import { extractSection, splitEmbedTarget } from "./note-section";

describe("splitEmbedTarget", () => {
  it("글 이름과 소제목을 나눈다", () => {
    expect(splitEmbedTarget("글")).toEqual({ name: "글", heading: null });
    expect(splitEmbedTarget("글 #  소제목 ")).toEqual({ name: "글", heading: "소제목" });
    expect(splitEmbedTarget("글#")).toEqual({ name: "글", heading: null });
  });
});

describe("extractSection", () => {
  const body = ["# 머리", "처음", "## 둘째 *장*", "내용", "### 안쪽", "깊이", "```", "## 코드 안", "```", "## 셋째", "끝"].join("\n");

  it("같거나 높은 단계의 다음 소제목 전까지 꺼낸다", () => {
    expect(extractSection(body, "둘째 장")).toBe(["## 둘째 *장*", "내용", "### 안쪽", "깊이", "```", "## 코드 안", "```"].join("\n"));
    expect(extractSection(body, "안쪽")).toBe(["### 안쪽", "깊이", "```", "## 코드 안", "```"].join("\n"));
  });

  it("마지막 절은 글 끝까지, 없는 소제목은 null", () => {
    expect(extractSection(body, "셋째")).toBe("## 셋째\n끝");
    expect(extractSection(body, "코드 안")).toBeNull();
    expect(extractSection(body, "없음")).toBeNull();
  });
});
