import { describe, expect, it } from "vitest";

import type { AiRequest } from "./ai";
import { buildUserPrompt, fitReferences } from "./ai-prompt";
import { EMPTY_BRIEF } from "./draft";

const base: AiRequest = {
  runId: "r1",
  task: "proofread",
  rules: "",
  noteName: "오늘의 글",
  text: "본문입니다",
  before: "앞부분",
  instruction: "",
  templatePrompt: "",
  web: false,
  groundedOnly: false,
  references: [],
};

describe("buildUserPrompt", () => {
  it("교정 작업은 대상 글을 <text>로 보내고 룰과 참고 글 섹션은 비어 있으면 넣지 않는다", () => {
    const prompt = buildUserPrompt(base);
    expect(prompt).toContain("<text>\n본문입니다\n</text>");
    expect(prompt).toContain("맞춤법");
    expect(prompt).not.toContain("<writing_rules>");
    expect(prompt).not.toContain("<references>");
    expect(prompt).not.toContain("<before>");
  });

  it("글쓰기 룰이 있으면 그대로 포함한다", () => {
    const prompt = buildUserPrompt({ ...base, task: "polish", rules: "- 한 문장은 60자 이내\n- 존댓말" });
    expect(prompt).toContain("<writing_rules>\n- 한 문장은 60자 이내\n- 존댓말\n</writing_rules>");
  });

  it("이어쓰기는 커서 앞의 글을 <before>로 보내고 <text>는 보내지 않는다", () => {
    const prompt = buildUserPrompt({ ...base, task: "continue", before: "여기까지 썼다" });
    expect(prompt).toContain("<before>\n여기까지 썼다\n</before>");
    expect(prompt).not.toContain("<text>");
  });

  it("참고 글을 이름과 함께 넣고 [[링크]]로 출처를 밝히라고 요청한다", () => {
    const prompt = buildUserPrompt({ ...base, task: "custom", instruction: "요약해", references: [{ name: "글쓰기 규칙", content: "짧게 쓴다" }] });
    expect(prompt).toContain('<note name="글쓰기 규칙">\n짧게 쓴다\n</note>');
    expect(prompt).toContain("[[글 이름]]");
    expect(prompt).toContain("지시: 요약해");
  });

  it("아주 긴 본문은 잘라서 보낸다", () => {
    const prompt = buildUserPrompt({ ...base, text: "가".repeat(40000) });
    expect(prompt.length).toBeLessThan(31000);
    expect(prompt).toContain("(이하 생략)");
  });
});

describe("buildUserPrompt: 템플릿", () => {
  const template: AiRequest = { ...base, task: "template", text: "본문 맥락입니다", templatePrompt: "양자 얽힘을 짧게 설명하세요.", instruction: "예시를 넣어 주세요", web: true };

  it("본문 맥락은 자료(<context>)로, 템플릿 지침은 태그 밖의 지시로 보낸다", () => {
    const prompt = buildUserPrompt(template);
    expect(prompt).toContain("<context>\n본문 맥락입니다\n</context>");
    expect(prompt).toContain("지침:\n양자 얽힘을 짧게 설명하세요.");
    expect(prompt).toContain("추가 요청: 예시를 넣어 주세요");
    expect(prompt).not.toContain("<template");
    expect(prompt).not.toContain("<text>");
  });

  it("웹 검색을 허용하면 출처를 밝히게 하고, 끄면 쓰지 않는다고 알린다", () => {
    expect(buildUserPrompt(template)).toContain("출처: [제목](주소)");
    const off = buildUserPrompt({ ...template, web: false });
    expect(off).toContain("웹 검색은 쓰지 않습니다. 확실하지 않은 사실은");
    expect(off).not.toContain("출처:");
  });

  it("참고 글 기반만 허용하면 새 사실을 덧붙이지 못하게 하고 웹 검색 안내를 빼다", () => {
    const prompt = buildUserPrompt({ ...template, groundedOnly: true });
    expect(prompt).toContain("새로운 사실을 덧붙이지 마세요");
    expect(prompt).not.toContain("출처: [제목](주소)");
  });

  it("글쓰기 룰이 있으면 템플릿 지침이 우선이라고 알린다", () => {
    const prompt = buildUserPrompt({ ...template, rules: "- 존댓말" });
    expect(prompt).toContain("<writing_rules>");
    expect(prompt).toContain("글쓰기 룰과 위 지침이 충돌하면 위 지침을 따르세요");
    expect(buildUserPrompt(template)).not.toContain("충돌하면");
  });

  it("본문 맥락이 비어 있으면 <context>를 보내지 않는다", () => {
    expect(buildUserPrompt({ ...template, text: "  " })).not.toContain("<context>");
  });
});

describe("fitReferences", () => {
  it("글마다 한도를 두고 전체 한도를 넘으면 뒤의 글은 뺀다", () => {
    const refs = Array.from({ length: 6 }, (_, i) => ({ name: `글${i}`, content: "가".repeat(9000) }));
    const fitted = fitReferences(refs);
    expect(fitted.length).toBe(3);
    expect(fitted.every((ref) => ref.content.length <= 8000 + 20)).toBe(true);
    expect(fitted.reduce((sum, ref) => sum + ref.content.length, 0)).toBeLessThanOrEqual(24000 + 60);
  });
});

describe("초안 자료", () => {
  const video = {
    kind: "youtube" as const,
    videoId: "zkmvCDSxqdc",
    url: "https://www.youtube.com/watch?v=zkmvCDSxqdc",
    title: "PR 2,000개 워크플로우",
    channel: "Tech Bridge",
    seconds: 2282,
    description: "영상 설명",
    transcript: "hello my name is Lauren",
    captionLabel: "영어 (자동 생성됨)",
  };
  const draftRequest: AiRequest = { ...base, task: "outline", brief: { ...EMPTY_BRIEF, topic: "에이전트 워크플로" }, sources: [video] };

  it("유튜브 자막을 <sources>로 넣고, 자료를 바탕으로 쓰라고 한다", () => {
    const prompt = buildUserPrompt(draftRequest);
    expect(prompt).toContain('<youtube title="PR 2,000개 워크플로우" channel="Tech Bridge" url="https://www.youtube.com/watch?v=zkmvCDSxqdc" length="38:02">');
    expect(prompt).toContain('<transcript language="영어 (자동 생성됨)">\nhello my name is Lauren\n</transcript>');
    expect(prompt).toContain("한국어로 옮겨 씁니다");
    expect(prompt).not.toContain("Read, Glob, Grep");
    expect(prompt.indexOf("<sources>")).toBeLessThan(prompt.indexOf("<brief>"));
  });

  it("프로젝트 요약을 함께 넣고, 읽기 도구로 더 보라고 한다", () => {
    const prompt = buildUserPrompt({ ...draftRequest, sources: [] }, ['<project name="app" path="/p/app" files="3">\n</project>']);
    expect(prompt).toContain('<project name="app"');
    expect(prompt).toContain("Read, Glob, Grep");
    expect(prompt).not.toContain("<youtube");
  });

  it("자료가 없으면 <sources>를 넣지 않고, 다른 작업에는 자료를 넣지 않는다", () => {
    expect(buildUserPrompt({ ...draftRequest, sources: [] })).not.toContain("<sources>");
    expect(buildUserPrompt({ ...base, sources: [video] })).not.toContain("<sources>");
  });
});
