/** 한국어 글을 묵독하는 속도 (공백을 뺀 글자 수 기준, 분당) */
const CHARS_PER_MINUTE = 500;
/** 200자 원고지: 한 줄 20칸, 한 장 10줄 */
const SHEET_COLUMNS = 20;
const SHEET_ROWS = 10;

export interface TextStats {
  /** 공백 포함 글자 수 */
  chars: number;
  /** 공백을 뺀 글자 수 */
  charsNoSpace: number;
  /** 읽는 데 걸리는 시간(분). 글이 있으면 최소 1분 */
  readMinutes: number;
  /** 200자 원고지 매수 (소수 첫째 자리) */
  sheets: number;
}

/**
 * 200자 원고지 매수. 문단마다 첫 칸을 비우고 새 줄에서 시작하는 원고지 규칙대로 센다.
 * 그래서 글자 수 ÷ 200보다 조금 많다 (문단이 많을수록 더).
 */
export function manuscriptSheets(text: string) {
  let rows = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    const length = [...paragraph.trim()].length;
    if (length > 0) rows += Math.ceil((length + 1) / SHEET_COLUMNS);
  }
  return Math.round((rows / SHEET_ROWS) * 10) / 10;
}

export function textStats(text: string): TextStats {
  const chars = [...text.replace(/[\r\n]+/g, "")].length;
  const charsNoSpace = [...text.replace(/\s+/g, "")].length;
  return {
    chars,
    charsNoSpace,
    readMinutes: charsNoSpace === 0 ? 0 : Math.max(1, Math.round(charsNoSpace / CHARS_PER_MINUTE)),
    sheets: manuscriptSheets(text),
  };
}

/** 글의 목표 분량. frontmatter의 `goal: 3000`(글자, 공백 포함) 또는 `goal: 15매`(200자 원고지) */
export interface WritingGoal {
  unit: "chars" | "sheets";
  value: number;
}

const GOAL_LINE = /^goal[ \t]*:[ \t]*["']?([\d,.]+)[ \t]*(자|매)?["']?[ \t]*$/m;

/** frontmatter에서 목표 분량을 읽는다. 없거나 읽을 수 없으면 null */
export function parseGoal(frontmatter: string): WritingGoal | null {
  const match = GOAL_LINE.exec(frontmatter);
  const value = Number((match?.[1] ?? "").replace(/,/g, ""));
  if (!match || !Number.isFinite(value) || value <= 0) return null;
  return { unit: match[2] === "매" ? "sheets" : "chars", value };
}

export function formatGoal(goal: WritingGoal) {
  return goal.unit === "sheets" ? `${goal.value}매` : String(Math.round(goal.value));
}

/** 목표에 대한 진행률 (0~1을 넘을 수 있다) */
export function goalProgress(stats: TextStats, goal: WritingGoal) {
  return (goal.unit === "sheets" ? stats.sheets : stats.chars) / goal.value;
}

/**
 * frontmatter의 한 줄짜리 값을 바꾸거나 넣는다. value가 null이면 그 줄을 지운다.
 * frontmatter가 없으면 새로 만들고, 다른 줄만 남지 않으면 frontmatter를 통째로 지운다.
 */
export function setFrontmatterLine(frontmatter: string, key: string, value: string | null) {
  const line = value === null ? null : `${key}: ${value}`;
  if (!frontmatter) return line ? `---\n${line}\n---\n` : "";
  const pattern = new RegExp(`^${key}[ \\t]*:.*(?:\\r?\\n)?`, "m");
  const [open = "---\n", ...rest] = frontmatter.split(/(?<=\n)/);
  const closeIndex = rest.findLastIndex((l) => /^---[ \t]*\r?\n?$/.test(l));
  const inner = rest.slice(0, closeIndex).join("");
  const close = rest.slice(closeIndex).join("");
  let next = pattern.test(inner) ? inner.replace(pattern, line ? `${line}\n` : "") : line ? `${inner}${line}\n` : inner;
  if (!next.trim()) next = "";
  return next ? `${open}${next}${close}` : "";
}
