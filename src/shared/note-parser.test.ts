import { describe, expect, it } from "vitest";

import { createLinkResolver, parseNote, rewriteWikiLinks } from "./note-parser";

describe("parseNote 링크", () => {
  it("별칭, 섹션, 블록, 임베드에서 대상 이름만 뽑고 중복을 없앤다", () => {
    const { links } = parseNote("[[A]] [[B|별칭]] [[C#섹션]] [[D^블록]] ![[E.png]] [[A]]");
    expect(links).toEqual(["A", "B", "C", "D", "E.png"]);
  });

  it("같은 글 안의 [[#섹션]]은 링크가 아니다", () => {
    expect(parseNote("[[#섹션]]").links).toEqual([]);
  });

  it("코드 블록과 인라인 코드 안의 링크는 무시한다", () => {
    const raw = "`[[인라인]]` 밖 [[진짜]]\n\n```md\n[[블록]]\n```\n\n~~~\n[[틸드]]\n~~~\n";
    expect(parseNote(raw).links).toEqual(["진짜"]);
  });

  it("닫히지 않은 코드 블록은 끝까지 코드로 본다", () => {
    expect(parseNote("[[앞]]\n```\n[[뒤]]\n").links).toEqual(["앞"]);
  });
});

describe("parseNote 태그", () => {
  it("본문의 #태그를 한글과 중첩 태그까지 인식한다", () => {
    expect(parseNote("오늘 #글쓰기 와 #project/alpha 그리고 #a_b-c").tags).toEqual(["글쓰기", "project/alpha", "a_b-c"]);
  });

  it("제목, 숫자뿐인 태그, URL 조각, 링크 섹션은 태그가 아니다", () => {
    const raw = "# 제목\n\n## 소제목\n\n#123 은 번호, https://x.com/#anchor, [[노트#섹션]], [링크](#앵커)";
    expect(parseNote(raw).tags).toEqual([]);
  });

  it("코드 안의 #은 태그가 아니다", () => {
    expect(parseNote("`#코드` 밖 #진짜\n\n```\n#블록\n```").tags).toEqual(["진짜"]);
  });

  it("frontmatter의 tags를 배열, 쉼표 문자열, 목록 형태로 읽고 #은 떼어 낸다", () => {
    expect(parseNote("---\ntags: [a, '#b']\n---\n").tags).toEqual(["a", "b"]);
    expect(parseNote("---\ntags: c, d\n---\n").tags).toEqual(["c", "d"]);
    expect(parseNote("---\ntags:\n  - e\n  - f\n---\n").tags).toEqual(["e", "f"]);
  });

  it("frontmatter와 본문의 같은 태그는 대소문자 무시하고 하나로 합친다", () => {
    expect(parseNote("---\ntags: [Draft]\n---\n\n#draft #Idea").tags).toEqual(["Draft", "Idea"]);
  });

  it("깨진 YAML이어도 본문 파싱은 계속된다", () => {
    expect(parseNote("---\ntags: [a\n---\n\n#ok").tags).toEqual(["ok"]);
  });
});

describe("createLinkResolver", () => {
  const notes = [
    { path: "글쓰기 규칙.md", name: "글쓰기 규칙" },
    { path: "일기/오늘.md", name: "오늘" },
    { path: "보관/오늘.md", name: "오늘" },
    { path: "a/b/깊은.md", name: "깊은" },
  ];
  const resolve = createLinkResolver(notes);

  it("이름은 대소문자 무시하고, 확장자와 섹션은 떼고 찾는다", () => {
    expect(resolve("글쓰기 규칙")).toBe("글쓰기 규칙.md");
    expect(resolve("글쓰기 규칙.md#a")).toBe("글쓰기 규칙.md");
  });

  it("폴더를 포함한 경로로 같은 이름의 글을 구분한다", () => {
    expect(resolve("보관/오늘")).toBe("보관/오늘.md");
    expect(resolve("일기/오늘")).toBe("일기/오늘.md");
  });

  it("이름이 겹치면 경로가 가장 짧은 글을 고르고, 없는 글은 null이다", () => {
    expect(resolve("깊은")).toBe("a/b/깊은.md");
    expect(resolve("없는 글")).toBeNull();
    expect(resolve("")).toBeNull();
  });
});

describe("rewriteWikiLinks", () => {
  const is = (name: string) => name === "옛 이름";
  const to = () => "새 이름";

  it("섹션, 블록, 별칭, 임베드를 유지한 채 대상 이름만 바꾼다", () => {
    const { content, count } = rewriteWikiLinks("[[옛 이름]] [[옛 이름#절|별칭]] ![[옛 이름^b]] [[다른]]", is, to);
    expect(content).toBe("[[새 이름]] [[새 이름#절|별칭]] ![[새 이름^b]] [[다른]]");
    expect(count).toBe(3);
  });

  it("코드 안의 링크는 건드리지 않는다", () => {
    const raw = "`[[옛 이름]]` [[옛 이름]]\n```\n[[옛 이름]]\n```";
    const { content, count } = rewriteWikiLinks(raw, is, to);
    expect(content).toBe("`[[옛 이름]]` [[새 이름]]\n```\n[[옛 이름]]\n```");
    expect(count).toBe(1);
  });

  it("바꿀 게 없으면 원문 그대로이고 count는 0이다", () => {
    const raw = "[[다른]] 글";
    expect(rewriteWikiLinks(raw, is, to)).toEqual({ content: raw, count: 0 });
  });
});
