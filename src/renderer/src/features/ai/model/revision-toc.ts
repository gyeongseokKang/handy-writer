import { outlineHeadings, type OutlineHeading } from "@shared/draft";

export interface TocRow {
  before: OutlineHeading | null;
  after: OutlineHeading | null;
  /** 같은 제목이면 same, 고쳤으면 changed, 새로 생겼거나 없어졌으면 added/removed */
  kind: "same" | "changed" | "added" | "removed";
}

const key = (h: OutlineHeading) => `${h.level}:${h.text.trim()}`;

/**
 * 퇴고 전·후 목차를 나란히 견준다. 같은 제목은 같은 줄에 맞추고(LCS), 사이에 끼인 것은
 * 같은 자리끼리 '고침'으로, 남는 것은 '추가'·'삭제'로 둔다.
 */
export function compareToc(beforeText: string, afterText: string): TocRow[] {
  const a = outlineHeadings(beforeText);
  const b = outlineHeadings(afterText);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i]![j] = key(a[i]!) === key(b[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  }
  const rows: TocRow[] = [];
  let i = 0;
  let j = 0;
  const gapA: OutlineHeading[] = [];
  const gapB: OutlineHeading[] = [];
  const flush = () => {
    const n = Math.max(gapA.length, gapB.length);
    for (let k = 0; k < n; k++) {
      const before = gapA[k] ?? null;
      const after = gapB[k] ?? null;
      rows.push({ before, after, kind: before && after ? "changed" : before ? "removed" : "added" });
    }
    gapA.length = 0;
    gapB.length = 0;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && key(a[i]!) === key(b[j]!)) {
      flush();
      rows.push({ before: a[i]!, after: b[j]!, kind: "same" });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && dp[i + 1]![j]! >= dp[i]![j + 1]!)) gapA.push(a[i++]!);
    else gapB.push(b[j++]!);
  }
  flush();
  return rows;
}
