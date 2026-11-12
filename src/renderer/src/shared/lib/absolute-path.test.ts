import { describe, expect, it } from "vitest";

import { absolutePath } from "./absolute-path";

describe("absolutePath", () => {
  it("맥·리눅스 작업 폴더는 /로 잇는다", () => {
    expect(absolutePath("/Users/me/글/", "기록/메모.md")).toBe("/Users/me/글/기록/메모.md");
    expect(absolutePath("/Users/me/글", "")).toBe("/Users/me/글");
  });

  it("윈도우 작업 폴더는 \\로 잇는다", () => {
    expect(absolutePath("C:\\Users\\me\\글", "기록/메모.md")).toBe("C:\\Users\\me\\글\\기록\\메모.md");
  });
});
