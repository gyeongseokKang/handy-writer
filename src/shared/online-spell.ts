import { mask, type SpellIssue } from "./spellcheck";

/** 다음·네이버 맞춤법 검사기가 돌려주는 항목 하나 (hanspell의 결과 모양) */
export interface OnlineTypo {
  /** 틀린 부분 (낱말이나 어구) */
  token: string;
  suggestions: string[];
  /** 서비스가 알려주는 설명 (여러 줄일 수 있다) */
  info?: string;
  /** 다음: space, spell 등 */
  type?: string;
}

export type OnlineStatus = "ok" | "offline";

export interface OnlineSpellResult {
  status: OnlineStatus;
  typos: OnlineTypo[];
}

const MAX_HINT = 140;

/** 서비스의 긴 설명에서 앞의 두 줄만 한 줄로 만든다. */
export function summarizeInfo(info: string | undefined, fallback: string): string {
  const lines = (info ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^\(예\)$/.test(line));
  const text = lines.slice(0, 2).join(" ");
  if (!text) return fallback;
  return text.length > MAX_HINT ? `${text.slice(0, MAX_HINT - 1)}…` : text;
}

const TYPE_LABEL: Record<string, string> = { space: "띄어쓰기", spell: "맞춤법", stat: "통계 기반 제안" };

/** 서버로 보내기 전에 코드, 주소, #태그를 가리고, 위치가 어긋나지 않도록 같은 길이의 공백으로 바꾼다. */
export function maskForOnline(text: string) {
  return mask(text).replace(/[\u0000￼]/g, " ");
}

/**
 * 서비스가 알려준 틀린 부분(token)을 글에서 찾아 위치를 정한다.
 * 결과는 글의 앞에서부터 순서대로 오므로, 직전에 찾은 곳 뒤에서부터 찾아 같은 낱말이 여러 번 나와도 각각 짝을 맞춘다.
 */
export function mapTyposToIssues(text: string, typos: OnlineTypo[]): SpellIssue[] {
  const issues: SpellIssue[] = [];
  const used: Array<[number, number]> = [];
  let cursor = 0;

  for (const typo of typos) {
    const token = typo.token;
    const suggestions = [...new Set(typo.suggestions.map((s) => s.trim()).filter((s) => s && s !== token))];
    if (!token.trim() || suggestions.length === 0) continue;

    let start = text.indexOf(token, cursor);
    if (start === -1) start = text.indexOf(token);
    if (start === -1) continue;
    const end = start + token.length;
    if (used.some(([s, e]) => start < e && end > s)) continue;

    used.push([start, end]);
    cursor = end;
    const kind = typo.type ? (TYPE_LABEL[typo.type] ?? typo.type) : "맞춤법";
    issues.push({
      start,
      end,
      text: token,
      replacement: suggestions[0]!,
      suggestions,
      ruleId: `online-${typo.type ?? "spell"}`,
      hint: summarizeInfo(typo.info, `${kind} 검사기의 제안이에요.`),
      source: "online",
    });
  }
  return issues.sort((a, b) => a.start - b.start);
}

/** 규칙 기반 결과를 우선하고, 그 자리와 겹치는 온라인 결과는 뺀다. */
export function mergeIssues(rule: SpellIssue[], online: SpellIssue[]): SpellIssue[] {
  const extra = online.filter((o) => !rule.some((r) => o.start < r.end && o.end > r.start));
  return [...rule, ...extra].sort((a, b) => a.start - b.start);
}
