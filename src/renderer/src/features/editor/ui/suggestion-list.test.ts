import { describe, expect, it } from "vitest";

import { pagedScrollTop } from "./suggestion-list";

const view = { top: 0, height: 300, max: 700 };
const item = (index: number) => ({ top: index * 50, height: 50 });

describe("pagedScrollTop", () => {
  it("보이는 항목이면 스크롤하지 않는다", () => {
    expect(pagedScrollTop(view, item(5))).toBeNull();
  });

  it("아래로 넘어가면 다음 5개가 보이도록 스크롤한다", () => {
    // 항목 6(300~350)이 영역 밖: 그 항목과 뒤 4개(최대 550)까지 보이게
    expect(pagedScrollTop(view, item(6))).toBe(250);
  });

  it("끝에 가까우면 맨 아래까지만 스크롤한다", () => {
    expect(pagedScrollTop({ ...view, max: 100 }, item(6))).toBe(100);
  });

  it("위로 넘어가면 앞의 4개가 함께 보이도록 스크롤하고 0 아래로는 가지 않는다", () => {
    expect(pagedScrollTop({ top: 400, height: 300, max: 700 }, item(7))).toBe(150);
    expect(pagedScrollTop({ top: 100, height: 300, max: 700 }, item(1))).toBe(0);
  });
});
