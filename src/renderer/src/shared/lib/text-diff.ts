import { diffLines, diffWordsWithSpace } from "diff";

export type SegmentType = "same" | "added" | "removed";

export interface Segment {
  text: string;
  type: SegmentType;
}

export interface DiffLine {
  segments: Segment[];
  /** 이 줄에 추가되거나 지워진 글자가 있는지 */
  changed: boolean;
}

/** 바뀌지 않아서 접어 둔 줄들 */
export interface DiffGap {
  gap: number;
}

export type DiffRow = DiffLine | DiffGap;

export interface VersionDiff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

/** 바뀐 줄 앞뒤로 남겨 둘 줄 수 */
const CONTEXT_LINES = 2;

const charCount = (text: string) => [...text.replace(/\s+/g, "")].length;

/** 조각들을 줄바꿈 기준으로 잘라 줄 목록으로 만든다. 지워진 줄바꿈도 한 줄을 끝낸다. */
function toLines(segments: Segment[]): DiffLine[] {
  const lines: DiffLine[] = [];
  let current: Segment[] = [];
  const push = () => {
    lines.push({ segments: current, changed: current.some((s) => s.type !== "same" && s.text.trim() !== "") });
    current = [];
  };
  for (const segment of segments) {
    const pieces = segment.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) push();
      if (piece) current.push({ text: piece, type: segment.type });
    });
  }
  if (current.length > 0) push();
  return lines;
}

/** 앞뒤 버전을 비교한다. 줄 단위로 먼저 맞춘 뒤, 바뀐 줄 안에서는 낱말 단위로 다시 비교한다. */
export function diffVersions(before: string, after: string, collapse = true): VersionDiff {
  const segments: Segment[] = [];
  const parts = diffLines(before, after);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const next = parts[i + 1];
    if (part.removed && next?.added) {
      // 고친 줄: 낱말 단위로 비교해야 어디가 바뀌었는지 보인다.
      for (const word of diffWordsWithSpace(part.value, next.value)) {
        segments.push({ text: word.value, type: word.added ? "added" : word.removed ? "removed" : "same" });
      }
      i++;
    } else {
      segments.push({ text: part.value, type: part.added ? "added" : part.removed ? "removed" : "same" });
    }
  }

  const added = segments.filter((s) => s.type === "added").reduce((sum, s) => sum + charCount(s.text), 0);
  const removed = segments.filter((s) => s.type === "removed").reduce((sum, s) => sum + charCount(s.text), 0);
  const lines = toLines(segments);
  return { rows: collapse ? collapseLines(lines) : lines, added, removed };
}

/** 바뀐 줄에서 멀리 떨어진 같은 줄들은 "N줄 같음"으로 접는다. */
export function collapseLines(lines: DiffLine[], context = CONTEXT_LINES): DiffRow[] {
  const keep = lines.map(() => false);
  lines.forEach((line, index) => {
    if (!line.changed) return;
    for (let j = Math.max(0, index - context); j <= Math.min(lines.length - 1, index + context); j++) keep[j] = true;
  });
  const rows: DiffRow[] = [];
  let hidden = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (hidden > 0) rows.push({ gap: hidden });
      hidden = 0;
      rows.push(line);
    } else {
      hidden++;
    }
  });
  if (hidden > 0) rows.push({ gap: hidden });
  return rows;
}

export const isGap = (row: DiffRow): row is DiffGap => "gap" in row;
