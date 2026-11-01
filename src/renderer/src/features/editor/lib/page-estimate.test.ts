import { describe, expect, it } from "vitest";

import { paginate, type BlockBox } from "./page-estimate";

const block = (a4Top: number, a4Height: number, splittable = true): BlockBox => ({ a4Top, a4Height, top: a4Top * 2, height: a4Height * 2, splittable });

describe("paginate", () => {
  it("빈 글은 0쪽, 한 쪽에 들어가면 1쪽", () => {
    expect(paginate([])).toEqual({ pages: 0, breaks: [] });
    expect(paginate([block(0, 50)], 100, 0)).toEqual({ pages: 1, breaks: [] });
  });

  it("글 블록 가운데로 쪽이 넘어가면 그 비율대로 화면 위치를 정한다", () => {
    // 80~120에 걸친 문단: 경계 100은 문단의 절반 → 화면에서는 160 + 40 = 200
    expect(paginate([block(0, 70), block(80, 40)], 100, 0)).toEqual({ pages: 2, breaks: [{ page: 2, y: 200 }] });
  });

  it("나눌 수 없는 블록은 다음 쪽으로 넘기고 뒤 블록을 민다", () => {
    const result = paginate([block(0, 70), block(80, 40, false), block(130, 60)], 100, 0);
    // 그림이 100에서 시작하므로 마지막 블록은 150~210 → 3쪽, 경계 200은 그 블록의 5/6 지점
    expect(result.pages).toBe(3);
    expect(result.breaks[0]).toEqual({ page: 2, y: 160 });
    expect(result.breaks[1]?.page).toBe(3);
    expect(result.breaks[1]?.y).toBeCloseTo(260 + (50 / 60) * 120);
  });

  it("줄 높이를 알면 걸친 줄은 다음 쪽으로 보내고, 남은 빈 자리만큼 뒤가 밀린다", () => {
    // 60~150의 9줄 문단(줄 10): 경계 100에 4줄이 들어가고, 나머지 5줄은 100~150 → 다음 블록은 160에서 시작
    const result = paginate([block(0, 50), { ...block(60, 90), a4LineHeight: 10, lineHeight: 20 }, block(155, 40)], 100, 0);
    expect(result.breaks).toEqual([{ page: 2, y: 120 + 4 * 20 }]);
    expect(result.pages).toBe(2);
  });

  it("문단의 첫 두 줄과 끝 두 줄은 홀로 남기지 않는다", () => {
    // 첫 줄만 들어갈 자리 → 문단 통째로 다음 쪽
    expect(paginate([block(0, 85), { ...block(85, 50), a4LineHeight: 10 }], 100, 0).breaks).toEqual([{ page: 2, y: 170 }]);
    // 끝 한 줄만 넘어갈 상황 → 두 줄을 넘긴다 (5줄 중 3줄만 남긴다)
    expect(paginate([block(0, 50), { ...block(50, 50 + 1), a4LineHeight: 10.2, lineHeight: 10 }], 100, 0).breaks).toEqual([{ page: 2, y: 100 + 3 * 10 }]);
  });

  it("제목 높이만큼 첫 쪽이 짧다", () => {
    expect(paginate([block(0, 90)], 100, 20).pages).toBe(2);
  });
});
