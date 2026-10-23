import { describe, expect, it } from "vitest";

import {
  BUILTIN_TEMPLATES,
  blockTitle,
  defaultInputs,
  EMPTY_INPUT_NOTE,
  formatTemplateMeta,
  parseTemplate,
  parseTemplateMeta,
  renderTemplatePrompt,
  serializeTemplate,
  slugifyTemplateId,
  stripTemplateMetadata,
  unknownPlaceholders,
  validateInputs,
  type Template,
  type TemplateBlockMeta,
} from "./templates";

const sample: Template = {
  id: "more-info",
  name: "더 알아보기",
  description: "관련 내용 덧붙이기",
  style: "tip",
  title: "",
  context: "section",
  web: true,
  referencesOnly: false,
  fields: [
    { key: "topic", label: "주제", type: "text", required: true, placeholder: "예: 배경", options: [], default: "" },
    { key: "depth", label: "분량", type: "select", required: false, placeholder: "", options: ["짧게", "자세히"], default: "짧게" },
  ],
  prompt: "{{topic}}을(를) {{depth}} 설명하세요.\n두 번째 줄 {{ topic }}",
};

describe("parseTemplate / serializeTemplate", () => {
  it("쓰고 다시 읽으면 같은 템플릿이다 (한글, 여러 줄 프롬프트, select 포함)", () => {
    expect(parseTemplate("more-info", serializeTemplate(sample))).toEqual(sample);
  });

  it("사람이 쓴 파일을 읽는다", () => {
    const raw = `---
name: 용어 풀이
style: info
context: paragraph
web: false
fields:
  - key: term
    label: 용어
    required: true
---

‘{{term}}’을 풀어 쓰세요.
`;
    expect(parseTemplate("용어", raw)).toMatchObject({
      id: "용어",
      name: "용어 풀이",
      style: "info",
      context: "paragraph",
      web: false,
      prompt: "‘{{term}}’을 풀어 쓰세요.",
      fields: [{ key: "term", label: "용어", type: "text", required: true }],
    });
  });

  it("틀린 값은 기본값으로 대신하고 던지지 않는다", () => {
    const t = parseTemplate("x", "---\nstyle: 이상한값\ncontext: 어딘가\nfields:\n  - key: 1bad\n  - key: ok\n    type: select\n  - key: ok\n---\n본문");
    expect(t).toMatchObject({ name: "x", style: "note", context: "section", prompt: "본문" });
    // 잘못된 키, select인데 선택지가 없는 필드(→text), 중복 키는 정리된다.
    expect(t.fields).toEqual([expect.objectContaining({ key: "ok", type: "text" })]);
  });

  it("frontmatter가 없거나 YAML이 깨져도 프롬프트는 살린다", () => {
    expect(parseTemplate("a", "그냥 프롬프트").prompt).toBe("그냥 프롬프트");
    expect(parseTemplate("a", "---\nname: [깨짐\n---\n프롬프트").prompt).toBe("프롬프트");
  });

  it("내장 템플릿도 쓰고 읽으면 그대로다", () => {
    for (const builtin of BUILTIN_TEMPLATES) {
      const { builtin: _flag, ...rest } = builtin;
      expect(parseTemplate(builtin.id, serializeTemplate(builtin))).toEqual(rest);
    }
  });
});

describe("blockTitle", () => {
  it("제목이 비어 있으면 템플릿 이름을 쓴다", () => {
    expect(blockTitle({ name: "더 알아보기", title: "" })).toBe("더 알아보기");
    expect(blockTitle({ name: "더 알아보기", title: "  꼭 읽어 보세요 " })).toBe("꼭 읽어 보세요");
  });
});

describe("validateInputs / defaultInputs / renderTemplatePrompt", () => {
  it("필수값이 비었거나 선택지에 없으면 오류를 돌려준다", () => {
    expect(validateInputs(sample, { topic: "  ", depth: "짧게" })).toEqual({ topic: "주제을(를) 입력해 주세요." });
    expect(validateInputs(sample, { topic: "x", depth: "엄청 길게" })).toEqual({ depth: "분량은(는) 목록에서 골라 주세요." });
    expect(validateInputs(sample, { topic: "x", depth: "자세히" })).toEqual({});
    expect(validateInputs(sample, { topic: "x" })).toEqual({});
  });

  it("기본값을 채우고, select는 첫 선택지를 기본으로 한다", () => {
    expect(defaultInputs(sample)).toEqual({ topic: "", depth: "짧게" });
    expect(defaultInputs({ ...sample, fields: [{ ...sample.fields[1]!, default: "" }] })).toEqual({ depth: "짧게" });
  });

  it("{{키}}를 입력값으로 바꾸고 공백이 있어도 바꾼다", () => {
    expect(renderTemplatePrompt(sample, { topic: " 양자 얽힘 ", depth: "자세히" })).toBe("양자 얽힘을(를) 자세히 설명하세요.\n두 번째 줄 양자 얽힘");
  });

  it("빈 값은 AI가 본문에서 정하도록 안내하고, 정의되지 않은 키는 지운다", () => {
    expect(renderTemplatePrompt(sample, { topic: "", depth: "짧게" })).toContain(`${EMPTY_INPUT_NOTE}을(를) 짧게`);
    expect(renderTemplatePrompt({ ...sample, prompt: "A{{없는키}}B" }, {})).toBe("AB");
  });

  it("정의되지 않은 키를 알려준다", () => {
    expect(unknownPlaceholders({ ...sample, prompt: "{{topic}} {{오타}} {{오타}} {{depth}}" })).toEqual(["오타"]);
    expect(unknownPlaceholders(sample)).toEqual([]);
  });
});

describe("slugifyTemplateId", () => {
  it("파일 이름으로 쓸 수 없는 글자를 정리한다", () => {
    expect(slugifyTemplateId(' 더/알아보기: v2 ')).toBe("더 알아보기 v2");
    expect(slugifyTemplateId("../../etc")).toBe("etc");
    expect(slugifyTemplateId("   ")).toBe("");
  });
});

describe("블록 메타데이터", () => {
  const meta: TemplateBlockMeta = { id: "more-info", inputs: { topic: "양자 --> 얽힘 <b>", memo: "줄\n바꿈" }, extra: "짧게 --", web: true, scope: "paragraph" };

  it("HTML 주석이 끝나거나 줄이 나뉘지 않게 쓰고, 다시 읽으면 같은 값이다", () => {
    const comment = formatTemplateMeta(meta);
    expect(comment.startsWith("<!--hw-template {")).toBe(true);
    expect(comment.slice(4, -3)).not.toMatch(/-->|<|>|\n/);
    expect(parseTemplateMeta(`제목 ${comment}`)).toEqual(meta);
  });

  it("하이픈 하나는 그대로 두고, 연속된 하이픈만 이스케이프한다", () => {
    const comment = formatTemplateMeta({ ...meta, id: "more-info", inputs: { a: "a-b", b: "x--y", c: "---" } });
    expect(comment).toContain('"id":"more-info"');
    expect(comment).toContain('"a":"a-b"');
    // 주석 구분자(<!--, -->)를 뺀 JSON 부분에는 연속된 하이픈이 없어야 한다.
    expect(comment.slice(comment.indexOf("{"), -3)).not.toContain("--");
    expect(parseTemplateMeta(comment)?.inputs).toEqual({ a: "a-b", b: "x--y", c: "---" });
  });

  it("깨졌거나 id가 없는 메타데이터는 null이다", () => {
    expect(parseTemplateMeta("<!--hw-template {깨짐}-->")).toBeNull();
    expect(parseTemplateMeta('<!--hw-template {"inputs":{}}-->')).toBeNull();
    expect(parseTemplateMeta("메타 없음")).toBeNull();
  });

  it("알 수 없는 범위는 섹션으로 대신한다", () => {
    expect(parseTemplateMeta('<!--hw-template {"id":"a","scope":"???"}-->')?.scope).toBe("section");
  });

  it("export할 때는 메타데이터만 떼고 내용은 그대로 둔다", () => {
    const md = `> [!tip] 더 알아보기 ${formatTemplateMeta(meta)}\n> 본문 내용 <!-- 일반 주석 -->\n\n뒤 문단`;
    expect(stripTemplateMetadata(md)).toBe("> [!tip] 더 알아보기\n> 본문 내용 <!-- 일반 주석 -->\n\n뒤 문단");
  });
});
