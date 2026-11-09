import { describe, expect, it } from "vitest";

import { changeCount, composeRevision, revisionPieces } from "./revision-chunks";

const before = "나는 정말 글쓰기가 좋다.\n\n사실 매일 쓴다.\n\n## 둘째\n";
const after = "나는 글쓰기가 좋다.\n\n매일 쓴다.\n\n## 둘째: 매일 쓰는 이유\n";

describe("revisionPieces", () => {
  it("splits the revision into separate changes", () => {
    const pieces = revisionPieces(before, after);
    expect(changeCount(pieces)).toBe(3);
  });
  it("rebuilds the original when nothing is accepted and the revision when all are", () => {
    const pieces = revisionPieces(before, after);
    expect(composeRevision(pieces, () => false)).toBe(before);
    expect(composeRevision(pieces, () => true)).toBe(after);
  });
  it("applies only the chosen changes", () => {
    const pieces = revisionPieces(before, after);
    const firstOnly = composeRevision(pieces, (id) => id === 0);
    expect(firstOnly).toBe("나는 글쓰기가 좋다.\n\n사실 매일 쓴다.\n\n## 둘째\n");
  });
  it("keeps a replacement of several words as one change", () => {
    const pieces = revisionPieces("아주 많이 좋다", "무척 좋다");
    expect(changeCount(pieces)).toBe(1);
    expect(composeRevision(pieces, () => false)).toBe("아주 많이 좋다");
    expect(composeRevision(pieces, () => true)).toBe("무척 좋다");
  });
});
