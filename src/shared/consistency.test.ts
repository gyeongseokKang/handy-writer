import { describe, expect, it } from "vitest";

import { checkConsistency } from "./consistency";

const flat = (blocks: string[]) =>
  [...checkConsistency(blocks).entries()].flatMap(([block, issues]) => issues.map((i) => ({ block, text: i.text, to: i.replacement })));

describe("checkConsistency", () => {
  it("붙여 쓴 말과 띄어 쓴 말이 섞이면 더 많이 쓴 쪽으로 통일하라고 한다", () => {
    const blocks = ["웹사이트를 만들었다.", "이 웹 사이트는 빠르다.", "웹사이트에서 글을 쓴다. 웹사이트 주소도 있다."];
    expect(flat(blocks)).toEqual([{ block: 1, text: "웹 사이트", to: "웹사이트" }]);
  });

  it("조사는 빼고 낱말만 가리키며, 힌트에 횟수를 쓴다", () => {
    const issues = checkConsistency(["웹사이트를 열었다.", "웹사이트도 닫았다.", "웹 사이트를 봤다."]).get(2)!;
    expect(issues[0]).toMatchObject({ start: 0, end: 5, text: "웹 사이트", replacement: "웹사이트" });
    expect(issues[0]?.hint).toContain("2번");
  });

  it("같은 수면 먼저 쓴 표기를 따른다", () => {
    const issues = checkConsistency(["데이터베이스를 쓴다.", "데이터 베이스도 쓴다."]).get(1)!;
    expect(issues[0]).toMatchObject({ text: "데이터 베이스", replacement: "데이터베이스" });
    expect(issues[0]?.hint).toContain("먼저 쓴");
  });

  it("영문은 하이픈과 글자 가운데 대문자가 다르면 알려 주고, 문장 첫 글자 대문자는 넘어간다", () => {
    expect(flat(["Send e-mail now.", "An email arrives.", "Your email is here."])).toEqual([{ block: 0, text: "e-mail", to: "email" }]);
    expect(flat(["Use JavaScript.", "I like JavaScript.", "Javascript is odd."])).toEqual([{ block: 2, text: "Javascript", to: "JavaScript" }]);
    expect(flat(["Web is big.", "the web is big."])).toEqual([]);
  });

  it("한 가지로만 쓴 말과 짧은 말은 건드리지 않는다", () => {
    expect(flat(["웹사이트를 만들었다.", "웹사이트도 만들었다."])).toEqual([]);
    expect(flat(["할 수 있다.", "할수 있다."])).toEqual([]);
  });

  it("코드와 주소는 보지 않는다", () => {
    expect(flat(["`웹 사이트` 와 https://웹사이트.com", "웹사이트를 본다."])).toEqual([]);
  });
});
