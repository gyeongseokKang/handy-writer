import { describe, expect, it } from "vitest";

import { checkSpelling, issueKey } from "./spellcheck";

const fixes = (text: string) => checkSpelling(text).map((i) => [i.text, i.replacement]);

describe("checkSpelling: 틀린 표기를 찾는다", () => {
  it.each([
    ["웬지 슬퍼", [["웬지", "왠지"]]],
    ["이게 왠일이야", [["왠일이야", "웬일이야"]]],
    ["왠만하면 가자", [["왠만하면", "웬만하면"]]],
    ["오늘이 몇일이지", [["몇일이지", "며칠이지"]]],
    ["벌써 끝났다고 했는데 됬다", [["됬다", "됐다"]]],
    ["어떻해 어떻해", [["어떻해", "어떡해"], ["어떻해", "어떡해"]]],
    ["오랫만이에요", [["오랫만이에요", "오랜만이에요"]]],
    ["금새 갔다", [["금새", "금세"]]],
    ["설레임을 안고", [["설레임을", "설렘을"]]],
    ["설레이는 마음", [["설레이는", "설레는"]]],
    ["희안한 일", [["희안한", "희한한"]]],
    ["어의없는 말", [["어의없는", "어이없는"]]],
    ["중요한 역활", [["역활", "역할"]]],
    ["일일히 확인", [["일일히", "일일이"]]],
    ["깨끗히 닦았다", [["깨끗히", "깨끗이"]]],
    ["꼼꼼이 살폈다", [["꼼꼼이", "꼼꼼히"]]],
    ["있읍니다", [["있읍니다", "있습니다"]]],
    ["그건 안되요", [["안되요", "안 돼요"]]],
    ["이래도 되요?", [["되요", "돼요"]]],
    ["공부해서 되서", [["되서", "돼서"]]],
    ["내일 뵈요", [["뵈요", "봬요"]]],
    ["그건 아니예요", [["아니예요", "아니에요"]]],
    ["기분이 않좋은", [["않좋은", "안 좋은"]]],
    ["그럴려면 가야지", [["그럴려면", "그러려면"]]],
    ["할려고 했는데", [["할려고", "하려고"]]],
    ["윗층과 윗쪽", [["윗층과", "위층과"], ["윗쪽", "위쪽"]]],
    ["알맞는 답", [["알맞는", "알맞은"]]],
    ["일찌기 떠났다", [["일찌기", "일찍이"]]],
  ])("%s", (text, expected) => {
    expect(fixes(text)).toEqual(expected);
  });

  it("ㄹ께는 받침이 ㄹ일 때만 -ㄹ게로 고친다", () => {
    expect(fixes("내가 할께")).toEqual([["할께", "할게"]]);
    expect(fixes("먼저 갈께요")).toEqual([["갈께요", "갈게요"]]);
    expect(fixes("선생님께 드렸다")).toEqual([]);
    expect(fixes("부모님께")).toEqual([]);
  });

  it("할 수 있다의 띄어쓰기를 본다 (-ㄹ수록 같은 어미는 건드리지 않는다)", () => {
    expect(fixes("할수있다")).toEqual([["할수있다", "할 수 있다"]]);
    expect(fixes("갈수없어")).toEqual([["갈수없어", "갈 수 없어"]]);
    expect(fixes("할수록 좋다")).toEqual([]);
    expect(fixes("가능성이 높을수록 좋다")).toEqual([]);
  });
});

describe("checkSpelling: 맞는 표기는 건드리지 않는다", () => {
  it.each([
    "왠지 슬퍼",
    "웬일이야, 웬만하면 가자",
    "며칠이지, 어떡해, 어떻게 할까",
    "일이 잘 됐다. 돼요, 돼서, 봬요",
    "오랜만이에요, 금세 갔다, 설렘을 안고, 설레는 마음",
    "안 돼요. 안 좋은 일",
    "할 수 있다. 할수록 좋다",
    "내가 할게. 선생님께 드릴게요",
    "있습니다, 갑니다",
    "그러려면 가야지, 하려고 했는데",
    "깨끗이, 꼼꼼히, 일일이, 일찍이",
    "",
  ])("%s", (text) => {
    expect(checkSpelling(text)).toEqual([]);
  });
});

describe("checkSpelling: 검사에서 빼는 곳과 범위", () => {
  it("주소, #태그, 인라인 코드 안은 검사하지 않는다", () => {
    expect(fixes("https://a.com/웬지 와 #웬지 와 `웬지`")).toEqual([]);
    expect(fixes("`웬지` 밖의 웬지")).toEqual([["웬지", "왠지"]]);
  });

  it("틀린 부분이 있는 한글 낱말 전체를 가리키고 위치는 원문 기준이다", () => {
    const text = "앞 문장. 그런데 됬다고 한다.";
    const [issue] = checkSpelling(text);
    expect(issue).toBeDefined();
    expect(text.slice(issue!.start, issue!.end)).toBe("됬다고");
    expect(issue).toMatchObject({ text: "됬다고", replacement: "됐다고", ruleId: "dwaet" });
    expect(issue!.hint).toContain("됐");
  });

  it("영어나 숫자가 붙어 있어도 한글 낱말까지만 본다", () => {
    const [issue] = checkSpelling("abc웬지123");
    expect(issue).toMatchObject({ text: "웬지", replacement: "왠지" });
  });

  it("같은 자리를 두 규칙이 차지하지 않는다 (안되요는 되요보다 먼저)", () => {
    const issues = checkSpelling("안되요");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "anidwaeyo", replacement: "안 돼요" });
  });

  it("결과는 글 순서대로 나온다", () => {
    expect(checkSpelling("됬다 그리고 웬지").map((i) => i.text)).toEqual(["됬다", "웬지"]);
  });
});

describe("issueKey", () => {
  it("규칙과 낱말이 같으면 같은 키다", () => {
    const [a] = checkSpelling("웬지");
    const [b] = checkSpelling("그냥 웬지 좋다");
    expect(issueKey(a!)).toBe(issueKey(b!));
    expect(issueKey(a!)).toBe("wenji:웬지");
  });
});
