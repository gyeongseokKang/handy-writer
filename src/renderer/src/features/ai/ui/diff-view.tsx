import { diffWordsWithSpace } from "diff";
import { useMemo } from "react";

/** 원문과 결과의 차이를 단어 단위로 보여준다. 지워진 부분은 빨강, 추가된 부분은 초록이다. */
export function DiffView({ original, result }: { original: string; result: string }) {
  const parts = useMemo(() => diffWordsWithSpace(original, result), [original, result]);
  const changed = parts.some((part) => part.added || part.removed);

  if (!changed) return <p className="text-sm text-muted-foreground">바뀐 곳이 없어요.</p>;

  return (
    <p className="text-sm leading-7 break-words whitespace-pre-wrap" aria-label="변경 내용">
      {parts.map((part, index) =>
        part.added ? (
          <ins key={index} className="rounded-sm bg-emerald-500/20 text-emerald-900 no-underline dark:text-emerald-200">
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={index} className="rounded-sm bg-red-500/20 text-red-900 dark:text-red-200">
            {part.value}
          </del>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </p>
  );
}
