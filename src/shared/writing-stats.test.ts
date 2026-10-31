import { describe, expect, it } from "vitest";

import { addDays, countChars, writingStreak } from "./writing-stats";

describe("writing-stats", () => {
  it("날짜를 더하고 뺀다 (달이 바뀌어도)", () => {
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("frontmatter와 줄바꿈은 세지 않는다", () => {
    expect(countChars("---\na: 1\n---\n가 나\n다")).toBe(4);
  });

  it("오늘 안 썼으면 어제까지 이어진 날을 센다", () => {
    const days = { "2026-10-28": 3, "2026-10-29": 5, "2026-10-30": 1, "2026-10-26": 9 };
    expect(writingStreak(days, "2026-10-31")).toBe(3);
    expect(writingStreak({ ...days, "2026-10-31": 2 }, "2026-10-31")).toBe(4);
    expect(writingStreak(days, "2026-11-02")).toBe(0);
  });
});
