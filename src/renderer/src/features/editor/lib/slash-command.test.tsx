import { BUILTIN_TEMPLATES } from "@shared/templates";
import { describe, expect, it } from "vitest";

import { filterSlashEntries } from "./slash-command";

const templateEntry = (name: string, id: string) => ({ title: name, description: "템플릿 블록", keywords: [id, "template", "템플릿"], icon: null, run: () => {} });

describe("filterSlashEntries", () => {
  const extra = BUILTIN_TEMPLATES.map((t) => templateEntry(t.name, t.id));

  it("검색어가 없으면 기본 블록 뒤에 템플릿을 모두 보여준다", () => {
    const all = filterSlashEntries("", extra);
    expect(all.length).toBe(filterSlashEntries("").length + extra.length);
    expect(all.at(-1)?.title).toBe("생각해 볼 질문");
  });

  it("공백이 들어간 템플릿 이름도 끝까지 입력해서 찾는다", () => {
    expect(filterSlashEntries("더 알아보기", extra).map((e) => e.title)).toEqual(["더 알아보기"]);
    expect(filterSlashEntries("용어 풀", extra).map((e) => e.title)).toEqual(["용어 풀이"]);
  });

  it("템플릿 ID와 '템플릿' 키워드로도 찾는다", () => {
    expect(filterSlashEntries("glossary", extra).map((e) => e.title)).toEqual(["용어 풀이"]);
    expect(filterSlashEntries("템플릿", extra)).toHaveLength(extra.length);
  });

  it("템플릿을 넘기지 않으면 기본 블록만 나온다", () => {
    expect(filterSlashEntries("tip").some((e) => e.title === "Tip")).toBe(false);
    expect(filterSlashEntries("콜").map((e) => e.title)).toEqual(["콜아웃"]);
  });
});
