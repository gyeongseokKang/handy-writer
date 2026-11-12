import { describe, expect, it } from "vitest";

import { mergeRanges, parseParts, partsText, reviseProgress, spliceParts, splitSections, stripPartTags } from "./revise-parts";

const DOC = "들어가는 말이다.\n\n## 첫째\n첫 문단.\n\n```\n# 코드 속 샵\n```\n\n### 첫째-하나\n작은 절.\n\n## 둘째\n둘째 문단.\n";

describe("splitSections", () => {
  it("제목마다 나누고 코드 블록 속 #은 무시한다", () => {
    const sections = splitSections(DOC);
    expect(sections.map((s) => [s.title, s.level])).toEqual([["", 0], ["첫째", 2], ["첫째-하나", 3], ["둘째", 2]]);
    expect(DOC.slice(sections[0]!.start, sections[0]!.end)).toBe("들어가는 말이다.");
    expect(DOC.slice(sections[1]!.start, sections[1]!.end)).toBe("## 첫째\n첫 문단.\n\n```\n# 코드 속 샵\n```");
    expect(sections[3]!.preview).toBe("둘째 문단.");
  });

  it("제목 앞 글이 없으면 첫 칸을 만들지 않는다", () => {
    expect(splitSections("\n## 하나\n가\n").map((s) => s.title)).toEqual(["하나"]);
  });
});

describe("고른 부분만 퇴고", () => {
  const sections = splitSections(DOC);

  it("이웃한 칸은 한 범위로 합치고, 떨어진 칸은 따로 둔다", () => {
    expect(mergeRanges(DOC, [sections[1]!, sections[2]!])).toHaveLength(1);
    expect(mergeRanges(DOC, [sections[3]!, sections[0]!])).toHaveLength(2);
  });

  it("part로 보내고 받은 글을 원문 자리에 끼워 넣는다", () => {
    const ranges = mergeRanges(DOC, [sections[0]!, sections[3]!]);
    expect(partsText(DOC, ranges)).toBe('<part n="1">\n들어가는 말이다.\n</part>\n\n<part n="2">\n## 둘째\n둘째 문단.\n</part>');
    const parts = parseParts('<part n="1">\n들어가는 말.\n</part>\n<part n="2">\n## 둘째\n고친 문단.\n</part>', 2);
    expect(parts).toEqual(["들어가는 말.", "## 둘째\n고친 문단."]);
    expect(spliceParts(DOC, ranges, parts!)).toBe(DOC.replace("들어가는 말이다.", "들어가는 말.").replace("둘째 문단.", "고친 문단."));
  });

  it("part 수가 맞지 않으면 null, 하나뿐이면 태그 없는 답도 받는다", () => {
    expect(parseParts('<part n="1">\n가\n</part>', 2)).toBeNull();
    expect(parseParts("그냥 고친 글\n", 1)).toEqual(["그냥 고친 글"]);
  });

  it("받는 중인 글에서 part 태그를 걷는다", () => {
    expect(stripPartTags('<part n="1">\n가나\n</part>\n\n<part n="2">\n다<pa')).toBe("가나\n\n다");
  });
});

describe("reviseProgress", () => {
  it("읽기 → 고친 글 쓰기(%) → 고친 점 → 제안 순으로 알려 준다", () => {
    expect(reviseProgress("생각 중", 100).stage).toBe("reading");
    expect(reviseProgress(`<revised>\n${"가".repeat(40)}`, 100)).toMatchObject({ stage: "writing", percent: 40 });
    expect(reviseProgress(`<revised>\n${"가".repeat(400)}`, 100).percent).toBe(99);
    expect(reviseProgress("<revised>\n가</revised>\n<notes>\n- 가 → 나 / 이유\n- 다", 100)).toMatchObject({ stage: "notes", notes: 2 });
    expect(reviseProgress("<revised>\n가</revised>\n<notes>\n- 가 → 나 / 이유\n</notes>\n<suggestions>\n", 100)).toMatchObject({ stage: "suggestions", notes: 1 });
  });
});
