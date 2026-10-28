import { describe, expect, it } from "vitest";

import { textStats } from "./text-stats";

describe("textStats", () => {
  it("공백 포함·제외 글자 수를 센다 (줄바꿈은 글자로 세지 않는다)", () => {
    expect(textStats("안녕 하세요\n\n반가워요")).toEqual({ chars: 10, charsNoSpace: 9, readMinutes: 1 });
  });
  it("이모지 같은 서로게이트 쌍도 한 글자로 센다", () => {
    expect(textStats("😀a").chars).toBe(2);
  });
  it("빈 글은 읽는 시간이 0분이고, 긴 글은 분당 500자로 계산한다", () => {
    expect(textStats("  \n ")).toEqual({ chars: 3, charsNoSpace: 0, readMinutes: 0 });
    expect(textStats("가".repeat(2500)).readMinutes).toBe(5);
  });
});
