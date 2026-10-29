import { describe, expect, it } from "vitest";

import { formatGoal, goalProgress, manuscriptSheets, parseGoal, setFrontmatterLine, textStats } from "./text-stats";

describe("textStats", () => {
  it("공백 포함·제외 글자 수를 센다 (줄바꿈은 글자로 세지 않는다)", () => {
    expect(textStats("안녕 하세요\n\n반가워요")).toMatchObject({ chars: 10, charsNoSpace: 9, readMinutes: 1 });
  });
  it("이모지 같은 서로게이트 쌍도 한 글자로 센다", () => {
    expect(textStats("😀a").chars).toBe(2);
  });
  it("빈 글은 읽는 시간이 0분이고, 긴 글은 분당 500자로 계산한다", () => {
    expect(textStats("  \n ")).toMatchObject({ chars: 3, charsNoSpace: 0, readMinutes: 0, sheets: 0 });
    expect(textStats("가".repeat(2500)).readMinutes).toBe(5);
  });
});

describe("manuscriptSheets", () => {
  it("문단마다 첫 칸을 비우고 새 줄에서 시작한다", () => {
    // 19자 + 들여쓰기 = 한 줄, 20자 + 들여쓰기 = 두 줄
    expect(manuscriptSheets("가".repeat(19))).toBe(0.1);
    expect(manuscriptSheets("가".repeat(20))).toBe(0.2);
    // 199자 한 문단 = 10줄 = 1매, 빈 줄은 세지 않는다
    expect(manuscriptSheets(`${"가".repeat(199)}\n\n`)).toBe(1);
    expect(manuscriptSheets("가\n나\n다")).toBe(0.3);
  });
});

describe("목표 분량", () => {
  it("frontmatter의 goal을 글자 수나 원고지 매수로 읽는다", () => {
    expect(parseGoal("---\ngoal: 3000\n---\n")).toEqual({ unit: "chars", value: 3000 });
    expect(parseGoal("---\ntitle: x\ngoal: 3,000자\n---\n")).toEqual({ unit: "chars", value: 3000 });
    expect(parseGoal("---\ngoal: \"15매\"\n---\n")).toEqual({ unit: "sheets", value: 15 });
    expect(parseGoal("---\ngoal: 0\n---\n")).toBeNull();
    expect(parseGoal("")).toBeNull();
  });
  it("진행률을 단위에 맞게 계산한다", () => {
    const stats = textStats("가".repeat(199));
    expect(goalProgress(stats, { unit: "chars", value: 398 })).toBeCloseTo(0.5);
    expect(goalProgress(stats, { unit: "sheets", value: 2 })).toBeCloseTo(0.5);
    expect(formatGoal({ unit: "sheets", value: 15 })).toBe("15매");
  });
});

describe("setFrontmatterLine", () => {
  it("없으면 frontmatter를 만들고, 있으면 그 줄만 바꾼다", () => {
    expect(setFrontmatterLine("", "goal", "3000")).toBe("---\ngoal: 3000\n---\n");
    expect(setFrontmatterLine("---\ntags: [a]\n---\n", "goal", "15매")).toBe("---\ntags: [a]\ngoal: 15매\n---\n");
    expect(setFrontmatterLine("---\ngoal: 10\ntags: [a]\n---\n", "goal", "20")).toBe("---\ngoal: 20\ntags: [a]\n---\n");
  });
  it("null이면 그 줄을 지우고, 남은 게 없으면 frontmatter도 지운다", () => {
    expect(setFrontmatterLine("---\ngoal: 10\ntags: [a]\n---\n", "goal", null)).toBe("---\ntags: [a]\n---\n");
    expect(setFrontmatterLine("---\ngoal: 10\n---\n", "goal", null)).toBe("");
    expect(setFrontmatterLine("", "goal", null)).toBe("");
  });
});
