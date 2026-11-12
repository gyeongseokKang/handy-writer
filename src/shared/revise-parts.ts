/** 퇴고할 부분을 고르고, 고른 부분만 보낸 뒤 결과를 원문 자리에 다시 끼워 넣는다. */

export interface TextSection {
  /** 제목 (제목 앞 글이면 빈 문자열) */
  title: string;
  /** 제목 수준 (제목 앞 글은 0) */
  level: number;
  /** 원문에서의 범위 [start, end). 끝의 빈 줄은 빼서 원문 자리에 그대로 남는다. */
  start: number;
  end: number;
  /** 제목 줄을 뺀 본문의 첫 줄 (미리보기) */
  preview: string;
}

export interface TextRange {
  start: number;
  end: number;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;

/** 마크다운을 제목마다 나눈다. 코드 블록 안의 `#`은 제목으로 보지 않는다. 제목 앞의 글은 첫 칸이 된다. */
export function splitSections(markdown: string): TextSection[] {
  const heads: { start: number; level: number; title: string }[] = [];
  let fenced = false;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced) {
      const match = HEADING.exec(line);
      if (match) heads.push({ start: offset, level: match[1]!.length, title: match[2]!.replace(/\s+#+\s*$/, "").trim() });
    }
    offset += line.length + 1;
  }
  const starts = [{ start: 0, level: 0, title: "" }, ...heads];
  const sections: TextSection[] = [];
  starts.forEach((head, i) => {
    const next = i + 1 < starts.length ? starts[i + 1]!.start : markdown.length;
    let start = head.start;
    const raw = markdown.slice(start, next);
    if (head.level === 0) {
      // 제목 앞 글: 앞의 빈 줄을 건너뛴다. 비었으면 칸을 만들지 않는다.
      if (!raw.trim()) return;
      start += raw.length - raw.trimStart().length;
    }
    const end = start + markdown.slice(start, next).trimEnd().length;
    const body = markdown.slice(start, end).split("\n").slice(head.level === 0 ? 0 : 1);
    const preview = body.map((l) => l.trim()).find(Boolean) ?? "";
    sections.push({ title: head.title, level: head.level, start, end, preview: preview.slice(0, 120) });
  });
  return sections;
}

/** 고른 칸들을 범위로 모은다. 사이에 빈 줄만 있는 이웃 칸은 한 범위로 합친다. */
export function mergeRanges(markdown: string, sections: TextRange[]): TextRange[] {
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  const ranges: TextRange[] = [];
  for (const s of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && !markdown.slice(last.end, s.start).trim()) last.end = Math.max(last.end, s.end);
    else ranges.push({ start: s.start, end: s.end });
  }
  return ranges;
}

/** 고른 범위들을 `<part n="1">…</part>`로 감싸 AI에 보낼 글을 만든다. */
export function partsText(markdown: string, ranges: TextRange[]): string {
  return ranges.map((r, i) => `<part n="${i + 1}">\n${markdown.slice(r.start, r.end)}\n</part>`).join("\n\n");
}

/** 고친 글에서 part들을 꺼낸다. 수가 맞지 않으면 null (part가 하나면 태그 없는 답도 받아 준다). */
export function parseParts(revised: string, count: number): string[] | null {
  const parts: string[] = [];
  const re = /<part n="(\d+)">\n?([\s\S]*?)\n?<\/part>/g;
  for (let m = re.exec(revised); m; m = re.exec(revised)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count) parts[n - 1] = m[2]!.replace(/\s+$/, "");
  }
  if (parts.length === 0 && count === 1 && revised.trim() && !/<part\b/.test(revised)) return [revised.replace(/\s+$/, "")];
  if (parts.length !== count || parts.some((p) => p === undefined)) return null;
  return parts;
}

/** 받는 중인 고친 글에서 part 태그를 걷어 읽기 좋게 만든다. */
export function stripPartTags(revised: string): string {
  return revised.replace(/<\/?part(?:\s+n="\d+")?>\n?/g, "").replace(/<\/?p?a?r?t?(?:\s[^>]*)?$/, "");
}

/** 고친 part들을 원문 자리에 끼워 넣어 글 전체를 만든다. */
export function spliceParts(markdown: string, ranges: TextRange[], parts: string[]): string {
  let out = "";
  let at = 0;
  ranges.forEach((r, i) => {
    out += markdown.slice(at, r.start) + (parts[i] ?? markdown.slice(r.start, r.end));
    at = r.end;
  });
  return out + markdown.slice(at);
}

export type ReviseStage = "reading" | "writing" | "notes" | "suggestions";

/**
 * 받는 중인 퇴고 답에서 어디까지 왔는지 본다.
 * 고친 글을 쓰는 동안은 원문 길이에 견준 비율(%)을, 고친 점을 쓰는 동안은 지금까지 쓴 줄 수를 알려 준다.
 */
export function reviseProgress(raw: string, sourceLength: number): { stage: ReviseStage; percent: number; notes: number } {
  const count = (tag: string) => {
    const open = raw.indexOf(`<${tag}>`);
    if (open === -1) return 0;
    const close = raw.indexOf(`</${tag}>`, open);
    return raw.slice(open, close === -1 ? undefined : close).split("\n").filter((l) => /^\s*[-*•]\s+\S/.test(l)).length;
  };
  if (raw.includes("<suggestions>")) return { stage: "suggestions", percent: 100, notes: count("notes") };
  if (raw.includes("<notes>")) return { stage: "notes", percent: 100, notes: count("notes") };
  const open = raw.indexOf("<revised>");
  if (open === -1) return { stage: "reading", percent: 0, notes: 0 };
  const close = raw.indexOf("</revised>", open);
  if (close !== -1) return { stage: "notes", percent: 100, notes: 0 };
  const written = stripPartTags(raw.slice(open + "<revised>".length)).trim().length;
  return { stage: "writing", percent: Math.min(99, Math.round((written / Math.max(1, sourceLength)) * 100)), notes: 0 };
}
