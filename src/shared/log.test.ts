import { describe, expect, it } from "vitest";

import { createLogBook, formatLogLine, parseLogInput } from "./log";

describe("로그 목록", () => {
  it("기록에 번호와 시각을 붙이고, 바로 이어 온 같은 메시지는 어디서 왔든 한 번만 남긴다", () => {
    let t = 1000;
    const book = createLogBook(() => t);
    expect(book.add({ level: "error", source: "AI", message: " 실패 " })).toMatchObject({ id: 1, time: 1000, message: "실패" });
    t = 1500;
    expect(book.add({ level: "error", source: "AI", message: "실패" })).toBeNull();
    expect(book.add({ level: "error", source: "화면", message: "실패" })).toBeNull();
    t = 4000;
    expect(book.add({ level: "error", source: "AI", message: "실패" })?.id).toBe(2);
    expect(book.add({ level: "warning", source: "Git", message: "다른 실패" })?.id).toBe(3);
    expect(book.add({ level: "error", source: "AI", message: "   " })).toBeNull();
    expect(book.list()).toHaveLength(3);
    book.clear();
    expect(book.list()).toEqual([]);
  });

  it("최근 300개만 남긴다", () => {
    let t = 0;
    const book = createLogBook(() => (t += 5000));
    for (let i = 0; i < 310; i++) book.add({ level: "error", source: "x", message: `m${i}` });
    expect(book.list()).toHaveLength(300);
    expect(book.list()[0]?.message).toBe("m10");
  });

  it("파일에 쓸 한 줄로 만들고, 여러 줄 메시지는 들여쓴다", () => {
    expect(formatLogLine({ id: 1, time: Date.UTC(2026, 9, 27, 8, 0, 0), level: "warning", source: "업데이트", message: "a\nb" })).toBe(
      "2026-10-27T08:00:00.000Z [WARN] [업데이트] a\n    b",
    );
  });

  it("렌더러에서 온 값의 모양을 맞춘다", () => {
    expect(parseLogInput({ message: "x" })).toEqual({ level: "error", source: "화면", message: "x" });
    expect(parseLogInput({ message: "x", level: "warning", source: " Git " })).toEqual({ level: "warning", source: "Git", message: "x" });
    expect(parseLogInput({ message: 3 })).toBeNull();
    expect(parseLogInput(null)).toBeNull();
  });
});
