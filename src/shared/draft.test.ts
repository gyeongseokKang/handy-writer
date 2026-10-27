import { describe, expect, it } from "vitest";

import type { AiRequest } from "./ai";
import { buildUserPrompt } from "./ai-prompt";
import { EMPTY_BRIEF, outlineHeadings, parseBrief, parseOutline, tidyDraftOutput } from "./draft";

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
