import { describe, expect, it } from "vitest";

import { collapseLines, diffVersions, isGap, type DiffLine } from "./history-diff";

const text = (line: DiffLine) => line.segments.map((s) => `${s.type === "added" ? "+" : s.type === "removed" ? "-" : ""}${s.text}`).join("|");

describe("diffVersions", () => {
  it("고친 줄은 낱말 단위로 추가·삭제를 나눈다", () => {
    const { rows, added, removed } = diffVersions("첫 줄\n오늘은 비가 왔다\n", "첫 줄\n오늘은 눈이 왔다\n", false);
    const lines = rows.filter((r): r is DiffLine => !isGap(r));
    expect(lines.map(text)).toEqual(["첫 줄", "오늘은 |-비가|+눈이| 왔다"]);
    expect(lines.map((l) => l.changed)).toEqual([false, true]);
    expect({ added, removed }).toEqual({ added: 2, removed: 2 });
  });

  it("처음 버전은 모두 추가로 보인다", () => {
    const { rows, added, removed } = diffVersions("", "가나\n다라\n");
    expect(rows.map((r) => (isGap(r) ? "gap" : text(r)))).toEqual(["+가나", "+다라"]);
    expect({ added, removed }).toEqual({ added: 4, removed: 0 });
  });

  it("지운 문단은 빨간 줄로 남는다", () => {
    const { rows } = diffVersions("하나\n\n둘\n\n셋\n", "하나\n\n셋\n", false);
    expect(rows.filter((r): r is DiffLine => !isGap(r) && r.changed).map(text)).toEqual(["-둘"]);
  });

  it("바뀌지 않은 먼 줄은 접는다", () => {
    const before = Array.from({ length: 20 }, (_, i) => `줄${i}`).join("\n");
    const after = before.replace("줄10", "줄열");
    const { rows } = diffVersions(before, after);
    expect(rows.map((r) => (isGap(r) ? `…${r.gap}` : text(r)))).toEqual(["…8", "줄8", "줄9", "줄|-10|+열", "줄11", "줄12", "…7"]);
  });

  it("같으면 바뀐 줄이 없다", () => {
    const { rows, added, removed } = diffVersions("같다\n", "같다\n");
    expect(added + removed).toBe(0);
    expect(rows).toEqual([{ gap: 1 }]);
  });
});

describe("collapseLines", () => {
  it("바뀐 줄이 가까우면 사이를 접지 않는다", () => {
    const line = (changed: boolean): DiffLine => ({ segments: [{ text: "x", type: changed ? "added" : "same" }], changed });
    const rows = collapseLines([line(true), line(false), line(false), line(false), line(false), line(true)], 2);
    expect(rows.some(isGap)).toBe(false);
  });
});
