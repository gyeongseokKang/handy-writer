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
