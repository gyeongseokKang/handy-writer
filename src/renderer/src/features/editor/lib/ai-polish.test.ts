import { Schema } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/handy-api", () => ({ api: {} }));

import { cleanPolished, sentenceAround } from "./ai-polish";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
});
const doc = (...paragraphs: string[]) => schema.node("doc", null, paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : [])));

describe("sentenceAround", () => {
  const d = doc("첫째 문장입니다. 둘째 문장은 조금 더 깁니다! 셋째 문장?", "다음 문단");

  it("범위가 든 문장 하나를 마침표까지 잡는다", () => {
    // 문단 시작은 1. "둘째" 위치
    const from = 1 + "첫째 문장입니다. ".length;
    const range = sentenceAround(d, from + 1, from + 3)!;
    expect(range.text).toBe("둘째 문장은 조금 더 깁니다!");
    expect(d.textBetween(range.from, range.to)).toBe(range.text);
  });

  it("첫 문장과 마지막 문장도 잡는다", () => {
    expect(sentenceAround(d, 2, 4)?.text).toBe("첫째 문장입니다.");
    const end = 1 + "첫째 문장입니다. 둘째 문장은 조금 더 깁니다! 셋째 문장?".length;
    expect(sentenceAround(d, end - 3, end - 1)?.text).toBe("셋째 문장?");
  });

  it("문장부호가 없으면 문단 전체다", () => {
    const text = "끝맺음이 없는 글";
    const range = sentenceAround(doc(text), 2, 4)!;
    expect(range.text).toBe(text);
  });

  it("두 문단에 걸친 범위나 빈 범위는 없다", () => {
    expect(sentenceAround(d, 2, d.content.size - 1)).toBeNull();
    expect(sentenceAround(d, 3, 3)).toBeNull();
  });
});

describe("cleanPolished", () => {
  it("줄바꿈, 따옴표, 코드 블록을 걷어 내 한 줄로 만든다", () => {
    expect(cleanPolished("“첫 문장입니다.\n둘째 문장입니다.”")).toBe("첫 문장입니다. 둘째 문장입니다.");
    expect(cleanPolished("```\n다듬은 글\n```")).toBe("다듬은 글");
  });
});
