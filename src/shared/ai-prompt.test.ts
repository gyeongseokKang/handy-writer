import { describe, expect, it } from "vitest";

import type { AiRequest } from "./ai";
import { buildUserPrompt, extractContinuation, fitReferences, parseRevision } from "./ai-prompt";
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

  it("이어쓰기는 지금 문단을 마무리하는 글만 쓰게 하고, 새 문단·글 전체 마무리는 막는다", () => {
    const prompt = buildUserPrompt({ ...base, task: "continue", before: "첫 문단.\n\n둘째 문단이 아직" });
    expect(prompt).toContain("마지막 문단이 커서가 있는 문단");
    expect(prompt).toContain("문단을 자연스럽게 마무리하는 글만");
    expect(prompt).toContain("다섯 문장 안팎");
    expect(prompt).toContain("여섯 문장을 넘기지 마세요");
    expect(prompt).toContain("새 문단, 소제목, 목록을 시작하지 말고");
    expect(prompt).not.toContain("이어질 내용을 쓰세요");
    expect(prompt).not.toContain("<after>");
  });

  it("문단 가운데에서 이어 쓰면 커서 뒤에 이미 있는 글을 <after>로 보낸다 (다시 쓰지 말라고)", () => {
    const prompt = buildUserPrompt({ ...base, task: "continue", before: "앞 글", after: "뒤에 남은 글" });
    expect(prompt).toContain("<after>\n뒤에 남은 글\n</after>");
    expect(prompt).toContain("이 글을 다시 쓰지는 마세요");
    // 공백뿐이면 보내지 않는다.
    expect(buildUserPrompt({ ...base, task: "continue", before: "앞 글", after: "  \n" })).not.toContain("<after>");
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

describe("extractContinuation", () => {
  it("keeps only the text inside the tag, dropping thinking outside it", () => {
    expect(extractContinuation("이 문단은 소제목 아래에 있고, after와 이어져야 한다.\n<continuation>\n처음에는 눈치가 보였는데</continuation>\n끝")).toBe("처음에는 눈치가 보였는데");
  });
  it("shows what has arrived so far while streaming", () => {
    expect(extractContinuation("생각 중…<continuation>처음에는 눈", { streaming: true })).toBe("처음에는 눈");
    expect(extractContinuation("<continuation>처음에는</contin", { streaming: true })).toBe("처음에는");
    expect(extractContinuation("이 문단은 소제목 아래에", { streaming: true })).toBe("");
  });
  it("falls back to the whole answer when the model did not use the tag", () => {
    expect(extractContinuation("이어서 쓴 문장입니다.")).toBe("이어서 쓴 문장입니다.");
  });
});

describe("revise", () => {
  const base: AiRequest = { runId: "r", task: "revise", rules: "", noteName: "글", text: "본문", before: "", instruction: "", templatePrompt: "", web: false, groundedOnly: false, references: [] };
  it("uses my revise rules, or the default criteria when there are none", () => {
    expect(buildUserPrompt({ ...base, reviseRules: "- 문장은 50자 안으로" })).toContain("<revise_rules>\n- 문장은 50자 안으로\n</revise_rules>");
    const fallback = buildUserPrompt({ ...base, reviseRules: "" });
    expect(fallback).toContain("군더더기");
    expect(fallback).toContain("기본 기준");
    expect(fallback).toContain("<revised>");
  });
  it("splits the answer into the revised text and the notes, dropping thinking outside the tags", () => {
    const answer = "먼저 살펴보면…\n<revised>\n고친 글입니다.\n\n둘째 문단.</revised>\n<notes>\n- 군더더기 삭제: 같은 말이 반복됨\n- 문단 순서: 결론을 뒤로\n</notes>\n끝";
    expect(parseRevision(answer)).toEqual({ revised: "고친 글입니다.\n\n둘째 문단.", notes: ["군더더기 삭제: 같은 말이 반복됨", "문단 순서: 결론을 뒤로"] });
    expect(parseRevision("생각 중 <revised>고친", { streaming: true }).revised).toBe("고친");
    expect(parseRevision("생각 중", { streaming: true }).revised).toBe("");
    expect(parseRevision("태그 없는 답").revised).toBe("태그 없는 답");
  });
});
