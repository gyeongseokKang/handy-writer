import { describe, expect, it } from "vitest";

import { compareToc } from "./revision-toc";

describe("compareToc", () => {
  it("lines up same headings and marks renamed, added and removed ones", () => {
    const before = "## 들어가며\n본문\n## 문제\n### 세부\n## 마치며\n";
    const after = "## 들어가며\n## 왜 Diff를 안 읽게 됐나\n### 세부\n## 한계\n## 마치며\n";
    expect(compareToc(before, after).map((r) => [r.kind, r.before?.text ?? null, r.after?.text ?? null])).toEqual([
      ["same", "들어가며", "들어가며"],
      ["changed", "문제", "왜 Diff를 안 읽게 됐나"],
      ["same", "세부", "세부"],
      ["added", null, "한계"],
      ["same", "마치며", "마치며"],
    ]);
  });
  it("is empty when there are no headings", () => {
    expect(compareToc("글", "글")).toEqual([]);
  });
});
