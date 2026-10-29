import { describe, expect, it } from "vitest";

import { checkStyle, LONG_SENTENCE } from "./style-lint";

const pick = (text: string) => checkStyle(text).map((i) => [i.ruleId.replace(/^style:/, ""), i.text, i.noFix ? null : i.replacement]);

describe("문장 다듬기", () => {
  it("겹말과 이중 피동은 고칠 말을 함께 알려 준다", () => {
    expect(pick("미리 예약하고 과반수 이상이 찬성해 보여진 결과다.")).toEqual([
      ["미리 예약", "미리 예약", "예약"],
      ["과반수 이상", "과반수 이상", "과반수"],
      ["보여진", "보여진", "보인"],
    ]);
  });

  it("번역투 ‘~에 있어서’와 두 칸 띄어쓰기", () => {
    expect(pick("글쓰기에 있어서  중요한 것")).toEqual([
      ["에 있어서", "에 있어서", "에서"],
      ["double-space", "  ", " "],
    ]);
  });

  it("한 문단에서 ‘것이다’와 ‘수 있다’는 두 번째부터 알린다", () => {
    const items = pick("이건 맞는 것이다. 저건 틀린 것이다. 할 수 있다.");
    expect(items).toEqual([["geosida", "것이다", null]]);
  });

  it("한 문장 안에서 조사만 다른 같은 낱말을 되풀이하면 두 번째를 알린다", () => {
    expect(pick("기록을 남기면 기록이 쌓인다. 기록은 좋다.")).toEqual([["repeat:기록", "기록", null]]);
  });

  it("흔한 말은 되풀이해도 알리지 않는다", () => {
    expect(pick("우리는 우리 길을 간다.")).toEqual([]);
  });

  it("긴 문장은 문장 전체를 가리키고 다른 항목과 겹쳐도 함께 보여 준다", () => {
    const long = `${"가나다라 ".repeat(LONG_SENTENCE / 5 + 2)}끝났다.`;
    const items = checkStyle(`짧다. ${long} 다음.`);
    const longItem = items.find((i) => i.ruleId === "style:long");
    expect(longItem?.text).toBe(long);
    expect(longItem?.noFix).toBe(true);
  });

  it("코드, 주소, #태그 안은 검사하지 않는다", () => {
    expect(pick("`미리 예약` https://x.com/미리예약 그리고 미리 예약")).toEqual([["미리 예약", "미리 예약", "예약"]]);
  });
});
