import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type FieldType = "text" | "textarea" | "select";
export type BlockStyle = "note" | "info" | "tip" | "success" | "question" | "warning" | "danger" | "quote";
export type ContextScope = "selection" | "paragraph" | "section" | "note" | "none";

export const BLOCK_STYLES: Array<{ id: BlockStyle; label: string }> = [
  { id: "note", label: "노트" },
  { id: "info", label: "정보" },
  { id: "tip", label: "팁" },
  { id: "success", label: "완료" },
  { id: "question", label: "질문" },
  { id: "warning", label: "주의" },
  { id: "danger", label: "위험" },
  { id: "quote", label: "인용" },
];

export const CONTEXT_SCOPES: Array<{ id: ContextScope; label: string }> = [
  { id: "selection", label: "선택한 글" },
  { id: "paragraph", label: "현재 문단" },
  { id: "section", label: "현재 섹션" },
  { id: "note", label: "글 전체" },
  { id: "none", label: "참고하지 않음" },
];

export interface TemplateField {
  /** 프롬프트의 `{{key}}` 자리에 들어간다 */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  /** select일 때 선택지 */
  options: string[];
  default: string;
}

export interface Template {
  /** 파일 이름(확장자 제외). 템플릿을 가리키는 ID로 쓴다. */
  id: string;
  name: string;
  description: string;
  style: BlockStyle;
  /** 블록 위에 보이는 제목 (비우면 name) */
  title: string;
  context: ContextScope;
  /** 웹 검색을 쓸지 (사용할 때 바꿀 수 있다) */
  web: boolean;
  /** 본문과 참고 글에 있는 내용만 쓰게 할지 (웹 검색은 쓰지 않는다) */
  referencesOnly: boolean;
  fields: TemplateField[];
  /** 사전 프롬프트. `{{key}}`가 입력값으로 바뀐다. */
  prompt: string;
  /** 앱에 내장된 템플릿인지 */
  builtin?: boolean;
  /** 내장 템플릿을 사용자가 고쳐서 저장했는지 */
  customized?: boolean;
}

const STYLE_IDS = new Set<string>(BLOCK_STYLES.map((s) => s.id));
const SCOPE_IDS = new Set<string>(CONTEXT_SCOPES.map((s) => s.id));
const FIELD_TYPES = new Set<string>(["text", "textarea", "select"]);
const KEY_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const PLACEHOLDER = /\{\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*\}\}/gu;

export const EMPTY_INPUT_NOTE = "(비어 있음: 본문 맥락에서 알맞게 정하세요)";

/** 블록 위에 보이는 제목. 비어 있으면 템플릿 이름이다. */
export const blockTitle = (template: Pick<Template, "name" | "title">) => template.title.trim() || template.name;

export const isValidFieldKey = (key: string) => KEY_PATTERN.test(key);

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value));

function parseField(raw: unknown): TemplateField | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = str(r["key"]).trim();
  if (!isValidFieldKey(key)) return null;
  const type = FIELD_TYPES.has(str(r["type"])) ? (str(r["type"]) as FieldType) : "text";
  const options = Array.isArray(r["options"]) ? r["options"].map((o) => str(o).trim()).filter(Boolean) : [];
  return {
    key,
    label: str(r["label"], key).trim() || key,
    type: type === "select" && options.length === 0 ? "text" : type,
    required: r["required"] === true,
    placeholder: str(r["placeholder"]),
    options,
    default: str(r["default"]),
  };
}

/**
 * 템플릿 파일을 읽는다. 사람이 직접 고친 파일일 수 있으니 틀린 값은 기본값으로 대신하고 던지지 않는다.
 * 중복되거나 잘못된 필드는 버린다.
 */
export function parseTemplate(id: string, raw: string): Template {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  let data: Record<string, unknown> = {};
  if (match) {
    try {
      const parsed = parseYaml(match[1] ?? "");
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      // 깨진 YAML이어도 본문(프롬프트)은 살린다.
    }
  }
  const prompt = (match ? raw.slice(match[0].length) : raw).replace(/^\r?\n/, "").replace(/\s+$/, "");

  const seen = new Set<string>();
  const fields = (Array.isArray(data["fields"]) ? data["fields"] : [])
    .map(parseField)
    .filter((field): field is TemplateField => field !== null && !seen.has(field.key) && Boolean(seen.add(field.key)));

  const name = str(data["name"], id).trim() || id;
  return {
    id,
    name,
    description: str(data["description"]),
    style: STYLE_IDS.has(str(data["style"])) ? (str(data["style"]) as BlockStyle) : "note",
    title: str(data["title"]).trim(),
    context: SCOPE_IDS.has(str(data["context"])) ? (str(data["context"]) as ContextScope) : "section",
    web: data["web"] === true,
    referencesOnly: data["referencesOnly"] === true,
    fields,
    prompt,
  };
}

export function serializeTemplate(template: Template): string {
  const meta: Record<string, unknown> = {
    name: template.name,
    ...(template.description ? { description: template.description } : {}),
    style: template.style,
    ...(template.title && template.title !== template.name ? { title: template.title } : {}),
    context: template.context,
    web: template.web,
    referencesOnly: template.referencesOnly,
    fields: template.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.type === "select" ? { options: field.options } : {}),
      ...(field.default ? { default: field.default } : {}),
    })),
  };
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n${template.prompt.trim()}\n`;
}

export type InputErrors = Record<string, string>;

/** 필수값이 비어 있거나 선택지에 없는 값이면 필드 키별로 오류 문구를 돌려준다. */
export function validateInputs(template: Template, inputs: Record<string, string>): InputErrors {
  const errors: InputErrors = {};
  for (const field of template.fields) {
    const value = (inputs[field.key] ?? "").trim();
    if (field.required && !value) errors[field.key] = `${field.label}을(를) 입력해 주세요.`;
    else if (value && field.type === "select" && !field.options.includes(value)) errors[field.key] = `${field.label}은(는) 목록에서 골라 주세요.`;
  }
  return errors;
}

/** 필드의 기본값으로 채운 입력값 */
export function defaultInputs(template: Template): Record<string, string> {
  return Object.fromEntries(template.fields.map((field) => [field.key, field.default || (field.type === "select" ? (field.options[0] ?? "") : "")]));
}

/** `{{key}}`를 입력값으로 바꾼다. 비어 있으면 AI가 본문에서 정하도록 안내 문구를 넣고, 없는 키는 지운다. */
export function renderTemplatePrompt(template: Template, inputs: Record<string, string>): string {
  const known = new Set(template.fields.map((field) => field.key));
  return template.prompt.replace(PLACEHOLDER, (_whole, key: string) => {
    if (!known.has(key)) return "";
    const value = (inputs[key] ?? "").trim();
    return value || EMPTY_INPUT_NOTE;
  });
}

/** 프롬프트에서 쓰였지만 정의되지 않은 `{{키}}`를 찾는다 (편집기에서 경고하기 위해). */
export function unknownPlaceholders(template: Pick<Template, "prompt" | "fields">): string[] {
  const known = new Set(template.fields.map((field) => field.key));
  return [...new Set([...template.prompt.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ""))].filter((key) => !known.has(key));
}

/** 파일 이름으로 쓸 수 있는 ID를 이름에서 만든다. */
export function slugifyTemplateId(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/* ---------- 블록(글 안)의 메타데이터 ---------- */

export interface TemplateBlockMeta {
  id: string;
  inputs: Record<string, string>;
  extra: string;
  web: boolean;
  scope: ContextScope;
}

const META_COMMENT = /<!--hw-template (\{[^\n]*?\})-->/;

/**
 * JSON을 HTML 주석 안에 넣어도 주석이 끝나지 않도록 연속된 `--`와 `<`, `>`를 이스케이프한다.
 * 하이픈 하나(more-info)는 주석을 깨뜨리지 않으므로 그대로 둬서 파일에서 읽기 쉽게 한다.
 */
function escapeForComment(json: string) {
  return json
    .replace(/-{2,}/g, (run) => run.replace(/-/g, "\\u002d"))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

export function formatTemplateMeta(meta: TemplateBlockMeta): string {
  return `<!--hw-template ${escapeForComment(JSON.stringify(meta))}-->`;
}

export function parseTemplateMeta(text: string): TemplateBlockMeta | null {
  const match = META_COMMENT.exec(text);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1] ?? "") as Partial<TemplateBlockMeta>;
    if (!data || typeof data.id !== "string" || !data.id) return null;
    const inputs = Object.fromEntries(Object.entries(data.inputs ?? {}).map(([k, v]) => [k, str(v)]));
    return {
      id: data.id,
      inputs,
      extra: str(data.extra),
      web: data.web === true,
      scope: SCOPE_IDS.has(str(data.scope)) ? (data.scope as ContextScope) : "section",
    };
  } catch {
    return null;
  }
}

/**
 * export용: 앱 전용 메타데이터(주석)를 떼고 실제 내용만 남긴다.
 * 블록은 평범한 콜아웃이라 내용은 그대로이고, 제목 줄 끝의 주석만 사라진다.
 */
export function stripTemplateMetadata(markdown: string): string {
  return markdown.replace(/[ \t]*<!--hw-template \{[^\n]*?\}-->/g, "");
}

/* ---------- 내장 템플릿 ---------- */

const baseField = (key: string, label: string, extra: Partial<TemplateField> = {}): TemplateField => ({
  key,
  label,
  type: "text",
  required: false,
  placeholder: "",
  options: [],
  default: "",
  ...extra,
});

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "more-info",
    name: "더 알아보기",
    description: "본문과 관련해 독자가 더 궁금해할 내용을 덧붙여요",
    style: "tip",
    title: "",
    context: "section",
    web: true,
    referencesOnly: false,
    fields: [
      baseField("topic", "주제", { placeholder: "비워 두면 본문에서 알맞은 주제를 골라요" }),
      baseField("depth", "분량", { type: "select", options: ["짧게", "보통", "자세히"], default: "보통" }),
    ],
    prompt:
      "독자가 본문을 읽다가 더 궁금해할 만한 내용을 {{topic}}을(를) 중심으로 {{depth}} 설명해 주세요.\n본문에 이미 있는 내용은 반복하지 말고, 새로 알 수 있는 정보만 쓰세요.\n어려운 용어는 쉬운 말로 풀어 쓰세요.",
    builtin: true,
  },
  {
    id: "tip",
    name: "Tip",
    description: "본문 내용에 바로 쓸 수 있는 실용적인 팁",
    style: "tip",
    title: "",
    context: "paragraph",
    web: false,
    referencesOnly: false,
    fields: [baseField("focus", "초점", { placeholder: "예: 초보자를 위한, 시간을 아끼는" })],
    prompt: "본문과 관련해 독자가 바로 써 볼 수 있는 실용적인 팁을 한두 문장으로 쓰세요. {{focus}}\n일반론이 아니라 구체적인 행동으로 쓰세요.",
    builtin: true,
  },
  {
    id: "glossary",
    name: "용어 풀이",
    description: "어려운 용어를 쉽게 풀어 설명해요",
    style: "info",
    title: "",
    context: "paragraph",
    web: true,
    referencesOnly: false,
    fields: [baseField("term", "용어", { required: true, placeholder: "풀이할 낱말" })],
    prompt: "‘{{term}}’을(를) 처음 보는 독자도 알 수 있게 풀어 쓰세요.\n정의 한 문장, 쉬운 예시 한 가지 순서로 쓰세요.",
    builtin: true,
  },
  {
    id: "summary",
    name: "핵심 요약",
    description: "섹션의 핵심을 짧게 정리해요",
    style: "note",
    title: "",
    context: "section",
    web: false,
    referencesOnly: true,
    fields: [baseField("count", "항목 수", { type: "select", options: ["3개", "5개"], default: "3개" })],
    prompt: "본문의 핵심을 {{count}}의 짧은 글머리 기호 목록으로 요약하세요. 각 항목은 한 문장입니다.",
    builtin: true,
  },
  {
    id: "questions",
    name: "생각해 볼 질문",
    description: "독자가 스스로 생각해 볼 질문을 던져요",
    style: "question",
    title: "",
    context: "section",
    web: false,
    referencesOnly: true,
    fields: [baseField("count", "질문 수", { type: "select", options: ["1개", "2개", "3개"], default: "2개" })],
    prompt: "본문을 읽은 독자가 스스로 생각해 볼 수 있는 질문을 {{count}} 쓰세요. 정답이 하나로 정해진 질문은 피하세요.",
    builtin: true,
  },
];
