import { describe, expect, it } from "vitest";

import type { AiRequest } from "./ai";
import { buildUserPrompt } from "./ai-prompt";
import { draftGoal, draftInstruction, draftTargetChars, EMPTY_BRIEF, outlineHeadings, outlineInstruction, parseBrief, parseOutline, tidyDraftOutput } from "./draft";

const request: AiRequest = {
  runId: "r1",
  task: "outline",
  rules: "- 존댓말",
  noteName: "달리기",
  text: "",
  before: "",
  instruction: "",
  templatePrompt: "",
  web: false,
  groundedOnly: false,
  references: [],
  brief: { ...EMPTY_BRIEF, topic: "달리기 습관", audience: "30대 직장인", length: "short", keyPoints: "하루 10분부터" },
};

describe("초안 만들기", () => {
  it("목차 요청은 기본정보를 <brief>로 보내고, 비어 있는 항목은 빼며, 분량에 맞는 장 개수를 알려준다", () => {
    const prompt = buildUserPrompt(request);
    expect(prompt).toContain("<writing_rules>\n- 존댓말\n</writing_rules>");
    expect(prompt).toContain("- 주제: 달리기 습관");
    expect(prompt).toContain("- 독자: 30대 직장인");
    expect(prompt).not.toContain("- 목적:");
    expect(prompt).toContain("꼭 넣을 내용:\n하루 10분부터");
    expect(prompt).toContain("3~4개");
    expect(prompt).toContain("목차만 출력");
    expect(prompt).not.toContain("<outline>");
  });

  it("초안 요청은 목차를 <outline>으로 보내고 분량을 글자 수로 알려준다", () => {
    const prompt = buildUserPrompt({ ...request, task: "draft", outline: "## 시작\n- 왜 달리나" });
    expect(prompt).toContain("<outline>\n## 시작\n- 왜 달리나\n</outline>");
    expect(prompt).toContain("약 1,000자");
    expect(prompt).toContain("(확인 필요)");
  });

  it("목차와 초안 모두 커밋 해시 같은 내부 식별자를 글에 쓰지 말라고 한다 (직접 적은 내용은 예외)", () => {
    for (const text of [outlineInstruction(EMPTY_BRIEF), draftInstruction(EMPTY_BRIEF, "## 가")]) {
      expect(text).toContain("커밋 해시");
      expect(text).toContain("이슈·PR 번호");
      expect(text).toContain("말로 풀어 씁니다");
      expect(text).toContain("꼭 넣을 내용이나 요청에 직접 적혀 있으면");
    }
  });

  it("렌더러에서 온 기본정보를 믿지 않고 모양을 맞춘다", () => {
    expect(parseBrief({ topic: "주제", length: "huge", tone: 3 })).toMatchObject({ topic: "주제", length: "medium", tone: "" });
    expect(parseBrief(null)).toMatchObject({ topic: "", length: "medium" });
    expect(parseOutline(42)).toBe("");
    expect(parseOutline("x".repeat(9000))).toHaveLength(8000);
  });

  it("결과를 감싼 코드 블록과 맨 위의 글 제목을 벗긴다", () => {
    expect(tidyDraftOutput("```markdown\n# 달리기\n\n## 시작\n본문\n```\n")).toBe("## 시작\n본문");
    expect(tidyDraftOutput("\n## 시작\n- 내용\n")).toBe("## 시작\n- 내용");
  });

  it("목차에서 제목 줄만 읽는다", () => {
    expect(outlineHeadings("## 시작\n- 설명\n### 작은 제목 ##\n그냥 줄\n#해시태그")).toEqual([
      { level: 2, text: "시작" },
      { level: 3, text: "작은 제목" },
    ]);
  });
});

describe("분량을 직접 정하기", () => {
  it("원고지 매수로 정하면 글자 수로 바꿔 알려주고, 목표는 매수 그대로 남긴다", () => {
    const brief = { ...EMPTY_BRIEF, topic: "주제", length: "custom" as const, customGoal: { unit: "sheets" as const, value: 30 } };
    expect(draftTargetChars(brief)).toBe(6000);
    expect(draftGoal(brief)).toEqual({ unit: "sheets", value: 30 });
    const prompt = buildUserPrompt({ ...request, brief });
    expect(prompt).toContain("- 분량: 200자 원고지 30매 (본문 약 6,000자)");
    expect(prompt).toContain("5~8개");
    expect(buildUserPrompt({ ...request, task: "draft", outline: "## 하나", brief })).toContain("본문은 약 6,000자(공백 포함)");
  });

  it("미리 정한 분량은 글자 수 목표가 된다", () => {
    expect(draftGoal({ ...EMPTY_BRIEF, length: "long" })).toEqual({ unit: "chars", value: 5000 });
  });

  it("렌더러에서 온 이상한 목표는 기본값으로 바꾸고 너무 큰 값은 줄인다", () => {
    expect(parseBrief({ length: "custom", customGoal: { unit: "x", value: -1 } })).toMatchObject({ length: "custom", customGoal: { unit: "chars", value: 3000 } });
    expect(parseBrief({ length: "custom", customGoal: { unit: "sheets", value: 9999 } }).customGoal).toEqual({ unit: "sheets", value: 250 });
  });
});

describe("draft structure", () => {
  const brief = { ...EMPTY_BRIEF, topic: "달리기" };
  it("leaves the outline free by default", () => {
    expect(outlineInstruction(brief)).not.toContain("기승전결");
    expect(parseBrief({ topic: "x" }).structure).toBe("free");
    expect(parseBrief({ topic: "x", structure: "아무거나" }).structure).toBe("free");
  });
  it("builds the outline and draft in 기승전결 order with part tags", () => {
    const b = parseBrief({ ...brief, structure: "kiseungjeongyeol" });
    const outline = outlineInstruction(b);
    expect(outline).toContain("- 구성: 기승전결");
    expect(outline).toContain("기→승→전→결");
    expect(outline).toContain("`[기]`");
    expect(outline).toContain("4~5개");
    const draft = draftInstruction(b, "## 처음\n- [기] 도입");
    expect(draft).toContain("[기]·[승]·[전]·[결]");
    expect(draft).toContain("[전]에서는");
    expect(draft).toContain("부분 표시는 본문에 쓰지 않습니다");
  });
  it("supports 서론·본론·결론 too", () => {
    expect(outlineInstruction(parseBrief({ ...brief, structure: "intro-body-conclusion" }))).toContain("서론→본론→결론");
  });
});
