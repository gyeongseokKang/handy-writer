import { describe, expect, it } from "vitest";

import { combineChapters, EMPTY_MANUSCRIPT, namespaceChapter, orderChapters, parseManuscripts, remapManuscripts } from "./manuscript";

const notes = ["책/10장.md", "책/2장.md", "책/부록/참고.md", "책/1장.md", "다른/글.md"].map((path) => ({ path }));

describe("orderChapters", () => {
  it("적힌 순서가 먼저, 나머지는 이름순(숫자 크기순), 원고 폴더 밖은 뺀다", () => {
    const result = orderChapters("책", notes, { ...EMPTY_MANUSCRIPT, order: ["2장.md", "없는.md"], excluded: ["부록/참고.md"] });
    expect(result.map((c) => [c.note.path, c.included])).toEqual([
      ["책/2장.md", true],
      ["책/1장.md", true],
      ["책/10장.md", true],
      ["책/부록/참고.md", false],
    ]);
  });
});

describe("parseManuscripts", () => {
  it("모양이 틀린 값은 버린다", () => {
    expect(parseManuscripts("x")).toEqual({});
    expect(parseManuscripts('{"책":{"order":["a.md",1],"goal":-1},"b":3}')).toEqual({ 책: { order: ["a.md"], excluded: [], goal: null } });
  });
});

describe("remapManuscripts", () => {
  const all = { 책: { order: ["1장.md", "2장.md"], excluded: ["2장.md"], goal: 1000 } };

  it("글 이름이 바뀌면 순서의 경로도 바꾸고, 지운 글은 뺀다", () => {
    expect(remapManuscripts(all, (p) => (p === "책/1장.md" ? "책/첫 장.md" : p === "책/2장.md" ? null : p))).toEqual({
      책: { order: ["첫 장.md"], excluded: [], goal: 1000 },
    });
  });

  it("폴더 이름이 바뀌면 원고도 따라간다", () => {
    const moved = (p: string) => (p.startsWith("책/") ? `새 책/${p.slice(2)}` : p);
    expect(remapManuscripts(all, moved)).toEqual({ "새 책": all.책 });
    expect(remapManuscripts(all, (p) => p)).toBeNull();
  });
});

describe("namespaceChapter / combineChapters", () => {
  it("각주와 그림 ID에 장 번호를 붙이되 코드 블록은 그대로 둔다", () => {
    const body = "본문[^1] [[#^fig-a]]\n\n그림 설명 ^fig-a\n\n```\n[^1]\n```\n\n[^1]: 내용";
    expect(namespaceChapter(body, 2)).toBe("본문[^c2-1] [[#^fig-a-c2]]\n\n그림 설명 ^fig-a-c2\n\n```\n[^1]\n```\n\n[^c2-1]: 내용");
  });

  it("1단계 제목이 없는 장에는 글 이름을 제목으로 붙인다", () => {
    expect(combineChapters([{ name: "첫 장", body: "내용\n" }, { name: "둘째", body: "\n# 두 번째 장\n본문" }])).toBe("# 첫 장\n\n내용\n\n# 두 번째 장\n본문\n");
  });
});
