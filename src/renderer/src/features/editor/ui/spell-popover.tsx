import { issueKey } from "@shared/spellcheck";
import { useEffect, useRef } from "react";

import { Button } from "@/shared/ui/button";

import type { SpellTarget } from "../lib/spell-check";

interface SpellPopoverProps {
  target: SpellTarget;
  onApply: (replacement?: string) => void;
  onIgnore: () => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const MARGIN = 8;

/** 밑줄 친 낱말에 마우스를 올리거나 눌렀을 때 뜨는 작은 창. 고친 낱말로 바꾸거나 무시할 수 있다. */
export function SpellPopover({ target, onApply, onIgnore, onClose, onMouseEnter, onMouseLeave }: SpellPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { issue, rect } = target;

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - 280 - MARGIN));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={issue.source === "style" ? "문장 다듬기 제안" : "맞춤법 제안"}
      data-spell-key={issueKey(issue)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ position: "fixed", left, top: rect.bottom + 6, zIndex: 50 }}
      className="w-70 space-y-2 rounded-lg border bg-card p-3 shadow-lg"
    >
      {issue.source === "style" && <p className="text-xs font-medium text-sky-700 dark:text-sky-300">문장 다듬기</p>}
      {!issue.noFix && (
        <p className="text-sm">
          <span className="text-muted-foreground line-through">{issue.text.trim() || "␣␣"}</span>
          <span className="mx-1.5 text-muted-foreground">→</span>
          <span className="font-semibold">{issue.replacement.trim() || "␣"}</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground">{issue.hint}</p>
      {issue.source === "online" && (
        <p className="text-xs text-muted-foreground">온라인 맞춤법 검사기(다음·네이버)의 제안이에요.</p>
      )}
      {(issue.suggestions?.length ?? 0) > 1 && (
        <div className="flex flex-wrap gap-1.5" aria-label="다른 제안">
          {issue.suggestions!.slice(1, 4).map((suggestion) => (
            <Button
              key={suggestion}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onApply(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {!issue.noFix && (
          <Button size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => onApply()}>
            바꾸기
          </Button>
        )}
        <Button size="sm" variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={onIgnore}>
          무시
        </Button>
      </div>
    </div>
  );
}
