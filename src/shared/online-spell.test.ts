import { describe, expect, it } from "vitest";

import { mapTyposToIssues, maskForOnline, mergeIssues, summarizeInfo, type OnlineTypo } from "./online-spell";
import { checkSpelling } from "./spellcheck";

// hanspell README의 실제 출력 예시에서 가져온 모양
const typos: OnlineTypo[] = [
  { token: "모래속에", suggestions: ["모래 속에"], type: "space", info: "띄어쓰기 오류입니다. 대치어를 참고하여 고쳐 쓰세요.\n명사 뒤의 의존 명사는 띄어 써야 합니다." },
  { token: "이세상의", suggestions: ["이 세상의"], type: "space", info: "관형사는 뒤에 오는 말과 띄어 쓰는 것이 옳습니다." },
];

describe("mapTyposToIssues", () => {
  const text = "나는 차가운 모래속에 두 손을 넣고, 쇼코는 이세상의 변두리에 섰다.";

  it("서비스가 알려준 틀린 부분의 위치를 글에서 찾아 맞춘다", () => {
    const issues = mapTyposToIssues(text, typos);
    expect(issues.map((i) => [text.slice(i.start, i.end), i.replacement])).toEqual([
      ["모래속에", "모래 속에"],
      ["이세상의", "이 세상의"],
    ]);
    expect(issues[0]).toMatchObject({ source: "online", ruleId: "online-space", suggestions: ["모래 속에"] });
  });

  it("같은 낱말이 여러 번 나오면 순서대로 각각 짝을 맞춘다", () => {
    const t = "모래속에 그리고 모래속에";
    const issues = mapTyposToIssues(t, [typos[0]!, typos[0]!]);
    expect(issues.map((i) => i.start)).toEqual([0, 9]);
  });

  it("글에 없거나 제안이 없거나 제안이 그대로인 항목은 버린다", () => {
    expect(mapTyposToIssues("안녕", [{ token: "없는말", suggestions: ["x"] }])).toEqual([]);
    expect(mapTyposToIssues("모래속에", [{ token: "모래속에", suggestions: [] }])).toEqual([]);
    expect(mapTyposToIssues("모래속에", [{ token: "모래속에", suggestions: ["모래속에", " "] }])).toEqual([]);
    expect(mapTyposToIssues("모래속에", [{ token: " ", suggestions: ["x"] }])).toEqual([]);
  });

  it("제안이 여러 개면 중복을 없애고 첫 번째를 기본으로 쓴다", () => {
    const [issue] = mapTyposToIssues("됬다", [{ token: "됬다", suggestions: ["됐다", "됐다", "되었다"], type: "spell" }]);
    expect(issue).toMatchObject({ replacement: "됐다", suggestions: ["됐다", "되었다"] });
  });

  it("서로 겹치는 항목은 앞의 것만 남긴다", () => {
    const issues = mapTyposToIssues("가나다라", [
      { token: "가나다", suggestions: ["A"] },
      { token: "나다라", suggestions: ["B"] },
    ]);
    expect(issues.map((i) => i.replacement)).toEqual(["A"]);
  });
});

describe("summarizeInfo", () => {
  it("앞의 두 줄만 한 줄로 합치고 길면 줄인다", () => {
    expect(summarizeInfo(typos[0]!.info, "기본")).toBe("띄어쓰기 오류입니다. 대치어를 참고하여 고쳐 쓰세요. 명사 뒤의 의존 명사는 띄어 써야 합니다.");
    expect(summarizeInfo("가".repeat(300), "기본").length).toBe(140);
    expect(summarizeInfo("(예)\n\n", "기본")).toBe("기본");
    expect(summarizeInfo(undefined, "기본")).toBe("기본");
  });
});

describe("maskForOnline", () => {
  it("코드, 주소, #태그와 inline 노드 자리를 같은 길이의 공백으로 바꿔서 위치를 지킨다", () => {
    const text = "앞 `웬지` https://a.com/x #태그 ￼ 뒤";
    const masked = maskForOnline(text);
    expect(masked.length).toBe(text.length);
    expect(masked).toBe(`앞 ${" ".repeat(4)} ${" ".repeat(15)} ${" ".repeat(3)} ${" "} 뒤`.replace(/ {2,}/g, (m) => m));
    expect(masked).not.toMatch(/웬지|a\.com|태그|￼/);
  });
});

describe("mergeIssues", () => {
  it("규칙 기반 결과가 먼저고, 같은 자리의 온라인 결과는 뺀다", () => {
    const text = "웬지 그리고 모래속에";
    const rule = checkSpelling(text);
    const online = mapTyposToIssues(text, [
      { token: "웬지", suggestions: ["왠지"] },
      { token: "모래속에", suggestions: ["모래 속에"] },
    ]);
    const merged = mergeIssues(rule, online);
    expect(merged.map((i) => [i.text, i.source ?? "rule"])).toEqual([
      ["웬지", "rule"],
      ["모래속에", "online"],
    ]);
  });
});
