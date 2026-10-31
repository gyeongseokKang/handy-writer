import { describe, expect, it } from "vitest";

import { listProps, removeProp, renameProp, setProp } from "./frontmatter-props";

const FM = `---
title: "처음 글" # 제목
date: 2026-10-31
count: 3
draft: true
tags: [a, b]
meta:
  x: 1
---
`;

describe("listProps", () => {
  it("항목의 종류와 값을 순서대로 읽는다", () => {
    expect(listProps(FM)).toEqual([
      { key: "title", kind: "text", value: "처음 글" },
      { key: "date", kind: "text", value: "2026-10-31" },
      { key: "count", kind: "text", value: "3" },
      { key: "draft", kind: "bool", value: "true" },
      { key: "tags", kind: "list", value: "a, b" },
      { key: "meta", kind: "other", value: "x: 1" },
    ]);
  });

  it("비어 있으면 빈 목록, 읽을 수 없으면 null", () => {
    expect(listProps("")).toEqual([]);
    expect(listProps("---\n: : bad\n  - x\n---\n")).toBeNull();
  });
});

describe("setProp / removeProp / renameProp", () => {
  it("값만 바꾸고 따옴표와 주석, 다른 줄은 그대로 둔다", () => {
    const next = setProp(FM, "title", "새 제목");
    expect(next).toContain('title: "새 제목" # 제목');
    expect(next).toContain("tags: [a, b]");
    expect(setProp(FM, "count", "5")).toContain("count: 5\n");
    expect(setProp(FM, "draft", "false", "bool")).toContain("draft: false\n");
    expect(setProp(FM, "tags", "a, c ,", "list")).toContain("tags: [a, c]");
  });

  it("없는 항목은 끝에 더하고, frontmatter가 없으면 만든다", () => {
    expect(setProp(FM, "status", "초고")).toMatch(/meta:\n {2}x: 1\nstatus: 초고\n---\n$/);
    expect(setProp("", "status", "초고")).toBe("---\nstatus: 초고\n---\n");
    expect(() => setProp(FM, " ", "x")).toThrow();
  });

  it("지우고, 다 지우면 frontmatter도 없앤다", () => {
    expect(removeProp(FM, "meta")).not.toContain("meta");
    expect(removeProp("---\na: 1\n---\n", "a")).toBe("");
  });

  it("이름을 바꾸되 자리는 지키고, 겹치면 막는다", () => {
    expect(renameProp(FM, "count", "개수")).toContain('title: "처음 글" # 제목\ndate: 2026-10-31\n개수: 3\n');
    expect(() => renameProp(FM, "count", "title")).toThrow("이미");
  });
});
