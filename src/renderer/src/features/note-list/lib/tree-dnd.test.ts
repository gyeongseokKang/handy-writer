import { describe, expect, it } from "vitest";

import { canDrop } from "./tree-dnd";

describe("canDrop", () => {
  it("글은 지금 있는 폴더가 아닌 곳이면 어디든 옮길 수 있다", () => {
    expect(canDrop({ kind: "note", path: "a/b/글.md" }, "a")).toBe(true);
    expect(canDrop({ kind: "note", path: "a/b/글.md" }, "")).toBe(true);
    expect(canDrop({ kind: "note", path: "a/b/글.md" }, "a/b")).toBe(false);
    expect(canDrop({ kind: "note", path: "글.md" }, "")).toBe(false);
  });

  it("폴더는 지금 있는 곳, 자기 자신, 그 안으로는 옮길 수 없다", () => {
    expect(canDrop({ kind: "folder", path: "a/b" }, "a")).toBe(false);
    expect(canDrop({ kind: "folder", path: "a/b" }, "a/b")).toBe(false);
    expect(canDrop({ kind: "folder", path: "a/b" }, "a/b/c")).toBe(false);
    expect(canDrop({ kind: "folder", path: "a/b" }, "")).toBe(true);
    expect(canDrop({ kind: "folder", path: "a/b" }, "x")).toBe(true);
    // 이름이 비슷한 다른 폴더는 막지 않는다.
    expect(canDrop({ kind: "folder", path: "a/b" }, "a/bc")).toBe(true);
    expect(canDrop({ kind: "folder", path: "a" }, "")).toBe(false);
  });
});
