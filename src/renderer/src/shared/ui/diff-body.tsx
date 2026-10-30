import { useLayoutEffect, useMemo, useRef } from "react";

import { diffVersions, isGap, type DiffLine } from "@/shared/lib/text-diff";

/** 변경 표시 애니메이션을 차례로 띄울 때 최대 지연 단계 */
const MAX_STAGGER = 24;

/**
 * 두 글의 차이를 줄 단위로 보여준다 (추가는 초록, 삭제는 빨강, 고친 줄은 낱말 단위).
 * 변경 기록 카드와 저장 충돌 창이 함께 쓴다. 모양은 index.css의 .history-diff를 따른다.
 */
function lineTone(line: DiffLine) {
  const types = new Set(line.segments.filter((s) => s.text.trim()).map((s) => s.type));
  if (types.has("added") && types.has("removed")) return "mixed";
  if (types.has("added")) return "added";
  if (types.has("removed")) return "removed";
  return "same";
}

export function DiffBody({ before, after, collapse, active }: { before: string; after: string; collapse: boolean; active: boolean }) {
  const diff = useMemo(() => diffVersions(before, after, collapse), [before, after, collapse]);
  const ref = useRef<HTMLDivElement>(null);

  // 이 장이 가운데로 오면 첫 변경으로 스크롤한다.
  useLayoutEffect(() => {
    if (!active) return;
    const first = ref.current?.querySelector<HTMLElement>("[data-changed='true']");
    const scroller = ref.current?.parentElement;
    if (first && scroller) scroller.scrollTo({ top: Math.max(0, first.offsetTop - scroller.clientHeight / 3) });
    else scroller?.scrollTo({ top: 0 });
  }, [active, diff]);

  let change = 0;
  const changedLines = diff.rows.filter((row) => !isGap(row) && row.changed).length;

  return (
    <div ref={ref} className="history-diff">
      {changedLines === 0 && <p className="py-6 text-center text-sm text-muted-foreground">본문은 그대로예요 (글 머리 정보나 공백만 바뀌었어요).</p>}
      {diff.rows.map((row, index) => {
        if (isGap(row)) {
          return (
            <div key={`gap-${index}`} className="history-gap">
              ⋯ {row.gap}줄 같음
            </div>
          );
        }
        return (
          <div key={index} data-changed={row.changed} data-tone={lineTone(row)} className="history-line">
            {row.segments.length === 0
              ? " "
              : row.segments.map((segment, i) => {
                  if (segment.type === "same") return <span key={i}>{segment.text}</span>;
                  const style = { "--i": Math.min(change++, MAX_STAGGER) } as React.CSSProperties;
                  return segment.type === "added" ? (
                    <ins key={i} style={style}>
                      {segment.text}
                    </ins>
                  ) : (
                    <del key={i} style={style}>
                      {segment.text}
                    </del>
                  );
                })}
          </div>
        );
      })}
    </div>
  );
}

