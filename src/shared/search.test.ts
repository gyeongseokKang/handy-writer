import { describe, expect, it } from "vitest";

import { searchNotes, splitTerms, type SearchDoc } from "./search";

const doc = (name: string, body = "", tags: string[] = [], folder = ""): SearchDoc => ({
  path: `${folder ? `${folder}/` : ""}${name}.md`,
  name,
  body,
  tags,
});

describe("splitTerms", () => {
  it("공백으로 나누고 소문자로 바꾸고 중복을 없앤다", () => {
    expect(splitTerms("  글쓰기   Habit 글쓰기 ")).toEqual(["글쓰기", "habit"]);
    expect(splitTerms("   ")).toEqual([]);
  });
});

describe("searchNotes", () => {
  it("검색어가 비어 있으면 아무것도 돌려주지 않는다", () => {
    expect(searchNotes([doc("a", "x")], "  ")).toEqual([]);
  });

  it("단어를 모두 포함한 글만 찾고, 단어는 제목 본문 태그에 나뉘어 있어도 된다", () => {
    const docs = [doc("퇴고", "소리 내어 읽기", ["체크리스트"]), doc("습관", "매일 쓴다"), doc("메모", "읽기만 한다")];
    expect(searchNotes(docs, "퇴고 읽기").map((r) => r.name)).toEqual(["퇴고"]);
    expect(searchNotes(docs, "체크리스트 소리").map((r) => r.name)).toEqual(["퇴고"]);
    expect(searchNotes(docs, "읽기").map((r) => r.name).sort()).toEqual(["메모", "퇴고"]);
  });

  it("대소문자를 구분하지 않는다", () => {
    expect(searchNotes([doc("README", "Hello World")], "readme hello")).toHaveLength(1);
  });

  it("제목 일치가 본문 일치보다, 제목 완전 일치가 부분 일치보다 위에 온다", () => {
    const docs = [
      doc("긴 글", "글쓰기 글쓰기 글쓰기 글쓰기 글쓰기"),
      doc("글쓰기 습관"),
      doc("글쓰기"),
      doc("태그만", "", ["글쓰기"]),
    ];
    expect(searchNotes(docs, "글쓰기").map((r) => r.name)).toEqual(["글쓰기", "글쓰기 습관", "태그만", "긴 글"]);
  });

  it("점수가 같으면 이름순으로 정렬하고 limit만큼만 돌려준다", () => {
    const docs = ["다", "가", "나"].map((name) => doc(name, "공통"));
    expect(searchNotes(docs, "공통").map((r) => r.name)).toEqual(["가", "나", "다"]);
    expect(searchNotes(docs, "공통", 2)).toHaveLength(2);
  });

  it("제목에서 일치한 위치를 알려준다", () => {
    const [result] = searchNotes([doc("글쓰기 습관")], "습관 글");
    expect(result?.titleRanges).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 6 },
    ]);
  });
});

describe("검색 결과 미리보기", () => {
  it("일치한 줄을 보여주고 마크다운 표시(제목, 목록, 인용)는 떼어 낸다", () => {
    const body = "# 개요\n\n- [ ] 소리 내어 읽기\n> 인용 속 소리\n관련 없는 줄";
    const [result] = searchNotes([doc("글", body)], "소리");
    expect(result?.snippets.map((s) => s.text)).toEqual(["소리 내어 읽기", "인용 속 소리"]);
    expect(result?.snippets[0]?.ranges).toEqual([{ start: 0, end: 2 }]);
  });

  it("단어를 더 많이 포함한 줄을 먼저 보여주고 최대 2줄까지만 보여준다", () => {
    const body = "사과만 있다\n사과와 배가 함께 있다\n사과 둘째\n사과 셋째";
    const [result] = searchNotes([doc("과일", body)], "사과 배");
    expect(result?.snippets).toHaveLength(2);
    expect(result?.snippets[0]?.text).toBe("사과와 배가 함께 있다");
  });

  it("긴 줄은 일치한 곳 주변만 잘라서 줄임표를 붙이고 일치 위치를 다시 계산한다", () => {
    const body = `${"가".repeat(100)}찾는말${"나".repeat(200)}`;
    const [result] = searchNotes([doc("긴", body)], "찾는말");
    const snippet = result?.snippets[0];
    expect(snippet?.text.startsWith("…")).toBe(true);
    expect(snippet?.text.endsWith("…")).toBe(true);
    const range = snippet?.ranges[0];
    expect(snippet?.text.slice(range?.start, range?.end)).toBe("찾는말");
  });

  it("제목이나 태그에만 일치하면 미리보기 줄이 없다", () => {
    const [result] = searchNotes([doc("퇴고", "본문")], "퇴고");
    expect(result?.snippets).toEqual([]);
  });

  it("겹치는 단어는 하나의 강조 구간으로 합친다", () => {
    const [result] = searchNotes([doc("글", "글쓰기 연습")], "글쓰 쓰기");
    expect(result?.snippets[0]?.ranges).toEqual([{ start: 0, end: 3 }]);
  });
});
