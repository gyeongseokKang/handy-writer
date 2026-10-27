/** 초안 만들기: 기본정보 → 목차 → 초안. 렌더러(입력 창)와 메인(프롬프트)이 함께 쓴다. */

export const DRAFT_GENRES = ["블로그 글", "에세이", "보고서", "기획서", "안내문", "기타"] as const;
export const DRAFT_TONES = ["해요체", "합니다체", "평서체(~다)"] as const;
export const DRAFT_LENGTHS = [
  { id: "short", label: "짧게", chars: 1000 },
  { id: "medium", label: "보통", chars: 2500 },
  { id: "long", label: "길게", chars: 5000 },
] as const;

export type DraftLength = (typeof DRAFT_LENGTHS)[number]["id"];

export interface DraftBrief {
  /** 주제 또는 제목 (필수) */
  topic: string;
  /** 글을 쓰는 목적 */
  purpose: string;
  /** 읽을 사람 */
  audience: string;
  genre: string;
  tone: string;
  length: DraftLength;
  /** 꼭 넣을 내용, 핵심 주장, 자료 */
  keyPoints: string;
  /** 그 밖의 요청 */
  extra: string;
}

export const EMPTY_BRIEF: DraftBrief = {
  topic: "",
  purpose: "",
  audience: "",
  genre: "블로그 글",
  tone: "해요체",
  length: "medium",
  keyPoints: "",
  extra: "",
};

const MAX_FIELD_CHARS = 4000;
const MAX_OUTLINE_CHARS = 8000;

/** 렌더러에서 온 값을 믿지 않고 모양을 맞춘다. */
export function parseBrief(value: unknown): DraftBrief {
  const v = (value ?? {}) as Partial<Record<keyof DraftBrief, unknown>>;
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, MAX_FIELD_CHARS) : "");
  const length = DRAFT_LENGTHS.find((l) => l.id === v.length)?.id ?? "medium";
  return {
    topic: str(v.topic),
    purpose: str(v.purpose),
    audience: str(v.audience),
    genre: str(v.genre),
    tone: str(v.tone),
    length,
    keyPoints: str(v.keyPoints),
    extra: str(v.extra),
  };
}

export function parseOutline(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_OUTLINE_CHARS) : "";
}

function briefSection(brief: DraftBrief) {
  const length = DRAFT_LENGTHS.find((l) => l.id === brief.length) ?? DRAFT_LENGTHS[1];
  const lines = [
    `- 주제: ${brief.topic.trim()}`,
    brief.purpose.trim() && `- 목적: ${brief.purpose.trim()}`,
    brief.audience.trim() && `- 독자: ${brief.audience.trim()}`,
    brief.genre.trim() && `- 글 종류: ${brief.genre.trim()}`,
    brief.tone.trim() && `- 문체: ${brief.tone.trim()}`,
    `- 분량: ${length.label} (본문 약 ${length.chars.toLocaleString("ko-KR")}자)`,
  ].filter(Boolean);
  const blocks = [`<brief>\n${lines.join("\n")}`];
  if (brief.keyPoints.trim()) blocks.push(`꼭 넣을 내용:\n${brief.keyPoints.trim()}`);
  if (brief.extra.trim()) blocks.push(`그 밖의 요청:\n${brief.extra.trim()}`);
  return `${blocks.join("\n\n")}\n</brief>`;
}

/** 분량에 맞는 장(## 제목) 개수 */
function sectionCount(length: DraftLength) {
  return length === "short" ? "3~4개" : length === "long" ? "5~8개" : "4~6개";
}

export function outlineInstruction(brief: DraftBrief) {
  return [
    briefSection(brief),
    "<brief>의 기본정보로 글의 목차를 만드세요.",
    "출력 규칙:",
    `- 장 제목은 \`## \`로 시작하는 줄로 ${sectionCount(brief.length)} 씁니다. 필요하면 장 아래에 \`### \` 소제목을 둡니다.`,
    "- 각 제목 바로 아래에 그 부분에서 다룰 내용을 `- `로 시작하는 한 줄로 적습니다.",
    "- 글 전체 제목(`# `), 머리말, 설명은 쓰지 말고 목차만 출력합니다.",
    "- 꼭 넣을 내용이 있으면 어느 장에서 다룰지 목차에 반영합니다.",
  ].join("\n");
}

export function draftInstruction(brief: DraftBrief, outline: string) {
  const length = DRAFT_LENGTHS.find((l) => l.id === brief.length) ?? DRAFT_LENGTHS[1];
  return [
    briefSection(brief),
    `<outline>\n${outline.trim()}\n</outline>`,
    "<brief>의 기본정보와 <outline>의 목차로 글의 초안을 쓰세요.",
    "출력 규칙:",
    "- 목차의 `##`, `###` 제목을 순서와 문구 그대로 쓰고, 그 아래에 본문을 씁니다. 제목 아래의 `- ` 설명 줄은 본문으로 풀어 쓰고 그대로 남기지 않습니다.",
    `- 본문은 약 ${length.chars.toLocaleString("ko-KR")}자로, 지정한 문체로 씁니다.`,
    "- 글 전체 제목(`# `), 머리말, 설명은 쓰지 말고 본문만 마크다운으로 출력합니다.",
    "- 확실하지 않은 수치, 날짜, 인용은 지어내지 말고 그 자리에 `(확인 필요)`라고 표시합니다.",
  ].join("\n");
}

/** AI가 목차나 초안을 코드 블록으로 감싸 보내거나 맨 위에 `# 제목`을 붙였으면 벗긴다. */
export function tidyDraftOutput(text: string) {
  let out = text.replace(/^\s*\n/, "").replace(/\s+$/, "");
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(out);
  if (fenced) out = fenced[1] ?? "";
  return out.replace(/^# [^\n]*\n+/, "");
}

export interface OutlineHeading {
  level: number;
  text: string;
}

/** 목차 마크다운에서 제목 줄만 읽는다. */
export function outlineHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1] && match[2]) headings.push({ level: match[1].length, text: match[2] });
  }
  return headings;
}
