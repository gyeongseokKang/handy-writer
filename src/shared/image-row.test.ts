import { describe, expect, it } from "vitest";

import { rowColumns } from "./image-row";

describe("rowColumns", () => {
  it("한 줄에 셋까지, 넷은 2×2로 나눈다", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(rowColumns)).toEqual([1, 2, 3, 2, 3, 3, 3]);
  });
});
