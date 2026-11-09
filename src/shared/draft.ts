/** 초안 만들기: 기본정보 → 목차 → 초안. 렌더러(입력 창)와 메인(프롬프트)이 함께 쓴다. */

import type { WritingGoal } from "./text-stats";

export const DRAFT_GENRES = ["블로그 글", "에세이", "보고서", "기획서", "안내문", "기타"] as const;
export const DRAFT_TONES = ["해요체", "합니다체", "평서체(~다)"] as const;
export const DRAFT_LENGTHS = [
  { id: "short", label: "짧게", chars: 1000 },
  { id: "medium", label: "보통", chars: 2500 },
  { id: "long", label: "길게", chars: 5000 },
] as const;

/** 글의 짜임. 기승전결·서론-본론-결론을 고르면 목차와 초안이 그 흐름을 따른다. */
export const DRAFT_STRUCTURES = [
  { id: "free", label: "자유롭게" },
  { id: "kiseungjeongyeol", label: "기승전결" },
  { id: "intro-body-conclusion", label: "서론·본론·결론" },
] as const;
export type DraftStructure = (typeof DRAFT_STRUCTURES)[number]["id"];

/** `custom`이면 brief.customGoal(글자 수 또는 원고지 매수)을 쓴다. */
export type DraftLength = (typeof DRAFT_LENGTHS)[number]["id"] | "custom";

/** 원고지 한 장에 들어가는 글자 수 (분량을 AI에게 글자 수로 알려 줄 때 쓴다) */
const CHARS_PER_SHEET = 200;
const MAX_CUSTOM_CHARS = 50_000;

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
  /** 글의 짜임 (기본 자유롭게) */
  structure: DraftStructure;
  /** 분량을 직접 정했을 때의 목표 */
  customGoal: WritingGoal;
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
  structure: "free",
  customGoal: { unit: "chars", value: 3000 },
  keyPoints: "",
  extra: "",
};

const MAX_FIELD_CHARS = 4000;
const MAX_OUTLINE_CHARS = 8000;

/** 렌더러에서 온 값을 믿지 않고 모양을 맞춘다. */
export function parseBrief(value: unknown): DraftBrief {
  const v = (value ?? {}) as Partial<Record<keyof DraftBrief, unknown>>;
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, MAX_FIELD_CHARS) : "");
  const length: DraftLength = v.length === "custom" ? "custom" : (DRAFT_LENGTHS.find((l) => l.id === v.length)?.id ?? "medium");
  const goal = (v.customGoal ?? {}) as Partial<WritingGoal>;
  const goalValue = typeof goal.value === "number" && Number.isFinite(goal.value) && goal.value > 0 ? goal.value : EMPTY_BRIEF.customGoal.value;
  const goalUnit = goal.unit === "sheets" ? "sheets" : "chars";
  return {
    topic: str(v.topic),
    purpose: str(v.purpose),
    audience: str(v.audience),
    genre: str(v.genre),
    tone: str(v.tone),
    length,
    structure: DRAFT_STRUCTURES.find((x) => x.id === v.structure)?.id ?? "free",
    customGoal: { unit: goalUnit, value: Math.min(goalValue, goalUnit === "sheets" ? MAX_CUSTOM_CHARS / CHARS_PER_SHEET : MAX_CUSTOM_CHARS) },
    keyPoints: str(v.keyPoints),
    extra: str(v.extra),
  };
}

export function parseOutline(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_OUTLINE_CHARS) : "";
}

/** 이 초안의 목표 분량. 새 글을 만들 때 frontmatter의 `goal:`로 남긴다. */
export function draftGoal(brief: DraftBrief): WritingGoal {
  if (brief.length === "custom") return brief.customGoal;
  return { unit: "chars", value: (DRAFT_LENGTHS.find((l) => l.id === brief.length) ?? DRAFT_LENGTHS[1]).chars };
}

/** AI에게 알려 줄 본문 글자 수 */
export function draftTargetChars(brief: DraftBrief) {
  const goal = draftGoal(brief);
  return Math.round(goal.unit === "sheets" ? goal.value * CHARS_PER_SHEET : goal.value);
}

function lengthLabel(brief: DraftBrief) {
  const chars = draftTargetChars(brief).toLocaleString("ko-KR");
  if (brief.length !== "custom") return `${(DRAFT_LENGTHS.find((l) => l.id === brief.length) ?? DRAFT_LENGTHS[1]).label} (본문 약 ${chars}자)`;
  return brief.customGoal.unit === "sheets" ? `200자 원고지 ${brief.customGoal.value}매 (본문 약 ${chars}자)` : `본문 약 ${chars}자`;
}

function briefSection(brief: DraftBrief) {
  const lines = [
    `- 주제: ${brief.topic.trim()}`,
    brief.purpose.trim() && `- 목적: ${brief.purpose.trim()}`,
    brief.audience.trim() && `- 독자: ${brief.audience.trim()}`,
    brief.genre.trim() && `- 글 종류: ${brief.genre.trim()}`,
    brief.tone.trim() && `- 문체: ${brief.tone.trim()}`,
    `- 분량: ${lengthLabel(brief)}`,
    brief.structure !== "free" && `- 구성: ${DRAFT_STRUCTURES.find((x) => x.id === brief.structure)?.label}`,
  ].filter(Boolean);
  const blocks = [`<brief>\n${lines.join("\n")}`];
  if (brief.keyPoints.trim()) blocks.push(`꼭 넣을 내용:\n${brief.keyPoints.trim()}`);
  if (brief.extra.trim()) blocks.push(`그 밖의 요청:\n${brief.extra.trim()}`);
  return `${blocks.join("\n\n")}\n</brief>`;
}

/** 분량에 맞는 장(## 제목) 개수 */
function sectionCount(chars: number) {
  return chars <= 1500 ? "3~4개" : chars >= 4500 ? "5~8개" : "4~6개";
}

const NO_INTERNAL_IDS =
  "- 커밋 해시(예: 8dfebef8), 이슈·PR 번호, 브랜치 이름, 내부 파일 경로, 에러 코드, 사내 도구·시스템 이름 같은 개발 내부 식별자는 독자에게 의미가 없으므로 글에 쓰지 않습니다. 그런 기록에서 얻은 사례는 무슨 일이 있었는지를 말로 풀어 씁니다. 다만 꼭 넣을 내용이나 요청에 직접 적혀 있으면 그대로 씁니다.";

/** 구성별로 각 부분이 맡는 일 */
const STRUCTURE_PARTS: Record<Exclude<DraftStructure, "free">, { tag: string; role: string }[]> = {
  kiseungjeongyeol: [
    { tag: "기", role: "도입. 화제를 꺼내고 독자가 읽고 싶어지게 문제나 장면을 연다" },
    { tag: "승", role: "전개. 화제를 구체적으로 풀고 사례·근거로 이야기를 키운다" },
    { tag: "전", role: "전환. 관점을 뒤집거나 새 국면·반전·핵심 깨달음을 보여 주는, 글에서 가장 힘을 주는 부분" },
    { tag: "결", role: "마무리. 앞의 이야기를 거두어 독자에게 남길 메시지로 맺는다" },
  ],
  "intro-body-conclusion": [
    { tag: "서론", role: "글의 주제와 문제의식, 무엇을 말할지 밝힌다" },
    { tag: "본론", role: "주장과 근거, 사례를 차례로 펼친다" },
    { tag: "결론", role: "핵심을 요약하고 제안이나 전망으로 맺는다" },
  ],
};

function structureRules(brief: DraftBrief, step: "outline" | "draft"): string[] {
  if (brief.structure === "free") return [];
  const parts = STRUCTURE_PARTS[brief.structure];
  const name = DRAFT_STRUCTURES.find((x) => x.id === brief.structure)?.label ?? "";
  const roles = parts.map((p) => `${p.tag}(${p.role})`).join(", ");
  if (step === "outline") {
    return [
      `- 글 전체를 ${name} 순서로 짭니다: ${roles}.`,
      `- 장 제목(\`## \`)은 ${parts.map((p) => p.tag).join("→")} 순서로 각 부분의 내용이 드러나게 짓되, 제목에 '${parts[0]!.tag}', '${parts[1]!.tag}' 같은 이름을 붙이지 않습니다.`,
      `- 각 장 설명 줄 맨 앞에 그 장이 맡는 부분을 \`[${parts[0]!.tag}]\`처럼 표시합니다. 분량이 길면 가운데 부분(${parts.slice(1, -1).map((p) => p.tag).join("·")})을 두 장 이상으로 나눠도 됩니다.`,
    ];
  }
  return [
    `- 목차의 ${parts.map((p) => `[${p.tag}]`).join("·")} 표시를 따라 ${name}의 흐름이 살아 있게 씁니다: ${roles}.`,
    ...(brief.structure === "kiseungjeongyeol" ? ["- [전]에서는 앞의 흐름과 분명히 다른 전환이 느껴지게 쓰고, [결]은 [전]에서 얻은 것을 바탕으로 맺습니다."] : []),
    "- `[기]` 같은 부분 표시는 본문에 쓰지 않습니다.",
  ];
}

/** 구성에 맞는 장 개수 */
function structuredCount(brief: DraftBrief) {
  if (brief.structure === "kiseungjeongyeol") return draftTargetChars(brief) >= 4500 ? "5~6개" : "4~5개";
  if (brief.structure === "intro-body-conclusion") return draftTargetChars(brief) >= 4500 ? "5~7개" : "3~5개";
  return sectionCount(draftTargetChars(brief));
}

export function outlineInstruction(brief: DraftBrief) {
  return [
    briefSection(brief),
    "<brief>의 기본정보로 글의 목차를 만드세요.",
    "출력 규칙:",
    `- 장 제목은 \`## \`로 시작하는 줄로 ${structuredCount(brief)} 씁니다. 필요하면 장 아래에 \`### \` 소제목을 둡니다.`,
    "- 각 제목 바로 아래에 그 부분에서 다룰 내용을 `- `로 시작하는 한 줄로 적습니다.",
    ...structureRules(brief, "outline"),
    "- 글 전체 제목(`# `), 머리말, 설명은 쓰지 말고 목차만 출력합니다.",
    "- 꼭 넣을 내용이 있으면 어느 장에서 다룰지 목차에 반영합니다.",
    NO_INTERNAL_IDS,
  ].join("\n");
}

export function draftInstruction(brief: DraftBrief, outline: string) {
  return [
    briefSection(brief),
    `<outline>\n${outline.trim()}\n</outline>`,
    "<brief>의 기본정보와 <outline>의 목차로 글의 초안을 쓰세요.",
    "출력 규칙:",
    "- 목차의 `##`, `###` 제목을 순서와 문구 그대로 쓰고, 그 아래에 본문을 씁니다. 제목 아래의 `- ` 설명 줄은 본문으로 풀어 쓰고 그대로 남기지 않습니다.",
    `- 본문은 약 ${draftTargetChars(brief).toLocaleString("ko-KR")}자(공백 포함)로, 지정한 문체로 씁니다.`,
    ...structureRules(brief, "draft"),
    "- 글 전체 제목(`# `), 머리말, 설명은 쓰지 말고 본문만 마크다운으로 출력합니다.",
    "- 확실하지 않은 수치, 날짜, 인용은 지어내지 말고 그 자리에 `(확인 필요)`라고 표시합니다.",
    NO_INTERNAL_IDS,
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
