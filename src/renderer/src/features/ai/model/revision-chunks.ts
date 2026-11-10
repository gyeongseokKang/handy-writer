import { diffSegments } from "@/shared/lib/text-diff";

/** 퇴고 결과를 고를 수 있게 나눈 조각: 그대로인 글, 또는 하나의 수정(지운 글 → 넣은 글) */
export type RevisionPiece =
  | { kind: "same"; text: string }
  | { kind: "change"; id: number; removed: string; added: string };

/**
 * 원문과 고친 글을 수정 단위로 나눈다. 붙어 있는 지움·넣음은 한 수정으로 묶고,
 * 공백만 사이에 둔 수정끼리도 한 덩어리로 묶어 낱말 사이가 어색하게 남지 않게 한다.
 */
export function revisionPieces(before: string, after: string): RevisionPiece[] {
  const pieces: RevisionPiece[] = [];
  let id = 0;
  let open: { removed: string; added: string } | null = null;
  let pendingSpace = "";
  const close = () => {
    if (open) pieces.push({ kind: "change", id: id++, ...open });
    open = null;
    if (pendingSpace) pieces.push({ kind: "same", text: pendingSpace });
    pendingSpace = "";
  };
  for (const segment of diffSegments(before, after)) {
    if (segment.type === "same") {
      // 수정 사이의 공백(줄바꿈 제외)은 다음 수정이 이어지면 같은 덩어리에 넣는다.
      if (open && /^[ \t]+$/.test(segment.text)) {
        pendingSpace += segment.text;
        continue;
      }
      close();
      const last = pieces[pieces.length - 1];
      if (last?.kind === "same") last.text += segment.text;
      else pieces.push({ kind: "same", text: segment.text });
      continue;
    }
    if (!open) open = { removed: "", added: "" };
    else if (pendingSpace) {
      open.removed += pendingSpace;
      open.added += pendingSpace;
      pendingSpace = "";
    }
    if (segment.type === "removed") open.removed += segment.text;
    else open.added += segment.text;
  }
  close();
  return pieces;
}

/** 고른 수정만 넣은 글. 고르지 않은 수정은 원문 그대로 둔다. */
export function composeRevision(pieces: RevisionPiece[], accepted: (id: number) => boolean): string {
  return pieces.map((p) => (p.kind === "same" ? p.text : accepted(p.id) ? p.added : p.removed)).join("");
}

export const changeCount = (pieces: RevisionPiece[]) => pieces.filter((p) => p.kind === "change").length;

/** 수정 조각마다 원문·고친 글에서 차지하는 자리 */
interface ChangeSpan { id: number; origStart: number; origEnd: number; revStart: number; revEnd: number }

function changeSpans(pieces: RevisionPiece[]): ChangeSpan[] {
  const spans: ChangeSpan[] = [];
  let orig = 0;
  let rev = 0;
  for (const p of pieces) {
    if (p.kind === "same") {
      orig += p.text.length;
      rev += p.text.length;
      continue;
    }
    spans.push({ id: p.id, origStart: orig, origEnd: orig + p.removed.length, revStart: rev, revEnd: rev + p.added.length });
    orig += p.removed.length;
    rev += p.added.length;
  }
  return spans;
}

/** 범위 [start, end)와 겹치거나(넣기만 한 수정은 그 안에 놓이거나) 하는 수정들 */
const overlapping = (spans: ChangeSpan[], start: number, end: number, side: "orig" | "rev") =>
  spans
    .filter((s) => {
      const a = side === "orig" ? s.origStart : s.revStart;
      const b = side === "orig" ? s.origEnd : s.revEnd;
      return a === b ? a >= start && a <= end : a < end && b > start;
    })
    .map((s) => s.id);

/**
 * '고친 점' 카드(원문 → 수정)를 diff의 수정 조각과 잇는다. 카드의 원문을 원래 글에서 찾고,
 * 못 찾으면 수정한 글을 고친 글에서 찾아 그 범위에 걸친 수정들을 그 카드의 것으로 본다.
 * 같은 원문이 여러 번 나오면 앞 카드가 쓰지 않은 다음 자리를 쓴다. 못 이으면 빈 목록.
 */
export function linkNotesToChanges(pieces: RevisionPiece[], original: string, revised: string, notes: { before?: string; after?: string }[]): number[][] {
  const spans = changeSpans(pieces);
  const usedOrig = new Map<string, number>();
  const usedRev = new Map<string, number>();
  const find = (text: string, needle: string, used: Map<string, number>) => {
    const from = used.get(needle) ?? 0;
    let at = text.indexOf(needle, from);
    if (at === -1 && from > 0) at = text.indexOf(needle);
    if (at !== -1) used.set(needle, at + 1);
    return at;
  };
  return notes.map((note) => {
    const before = note.before?.trim();
    if (before && before.length >= 2) {
      const at = find(original, before, usedOrig);
      if (at !== -1) {
        const ids = overlapping(spans, at, at + before.length, "orig");
        if (ids.length) return ids;
      }
    }
    const after = note.after?.trim();
    if (after && after.length >= 2) {
      const at = find(revised, after, usedRev);
      if (at !== -1) return overlapping(spans, at, at + after.length, "rev");
    }
    return [];
  });
}
