import { issueKey } from "@shared/spellcheck";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui/button";

import { polishSentence, type PolishRun, type SentenceRange } from "../lib/ai-polish";
import type { SpellTarget } from "../lib/spell-check";

interface SpellPopoverProps {
  target: SpellTarget;
  onApply: (replacement?: string) => void;
  /** 문장 다듬기 제안이 든 문장의 범위 (AI로 다듬을 글) */
  getSentence?: () => SentenceRange | null;
  /** AI가 다듬은 문장으로 그 자리를 바꾼다. 그 사이 글이 바뀌었으면 false */
  onApplyPolished?: (sentence: SentenceRange, polished: string) => boolean;
  noteName?: string;
  onIgnore: () => void;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const MARGIN = 8;

/** 밑줄 친 낱말에 마우스를 올리거나 눌렀을 때 뜨는 작은 창. 고친 낱말로 바꾸거나 무시할 수 있다. */
export function SpellPopover({ target, onApply, getSentence, onApplyPolished, noteName = "", onIgnore, onClose, onMouseEnter, onMouseLeave }: SpellPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { issue, rect } = target;
  const [ai, setAi] = useState<{ phase: "idle" | "running" | "done" | "error"; sentence?: SentenceRange; result?: string; error?: string }>({ phase: "idle" });
  const runRef = useRef<PolishRun | null>(null);

  // 창이 닫히거나 다른 제안으로 바뀌면 돌고 있던 AI 실행을 멈춘다.
  useEffect(() => () => runRef.current?.cancel(), []);

  const startPolish = () => {
    const sentence = getSentence?.();
    if (!sentence) return setAi({ phase: "error", error: "문장을 찾지 못했어요." });
    // 마우스를 올려서 뜬 창이어도 AI가 끝날 때까지는 닫히지 않게 붙들어 둔다.
    onMouseEnter?.();
    setAi({ phase: "running", sentence });
    const run = polishSentence(sentence.text, issue.hint, noteName);
    runRef.current = run;
    run.result
      .then((result) => runRef.current === run && setAi({ phase: "done", sentence, result }))
      .catch((error: unknown) => runRef.current === run && setAi({ phase: "error", sentence, error: error instanceof Error ? error.message : String(error) }));
  };
  const cancelPolish = () => {
    runRef.current?.cancel();
    runRef.current = null;
    setAi({ phase: "idle" });
  };

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
      // AI가 도는 중이거나 결과를 보여 주는 중에는 마우스가 벗어나도 닫지 않는다.
      onMouseLeave={() => (ai.phase === "running" || ai.phase === "done" ? undefined : onMouseLeave?.())}
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
      {ai.phase === "running" && (
        <p role="status" className="text-xs text-muted-foreground">
          AI가 문장을 다듬는 중이에요…
        </p>
      )}
      {ai.phase === "error" && (
        <p role="alert" className="text-xs text-destructive">
          {ai.error}
        </p>
      )}
      {ai.phase === "done" && ai.sentence && ai.result !== undefined && (
        <div data-testid="ai-polished" className="space-y-1 rounded-md bg-muted/60 p-2 text-sm">
          <p className="text-xs text-muted-foreground">AI가 다듬은 문장</p>
          <p className="leading-6 font-medium">{ai.result}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {ai.phase === "done" && ai.sentence && ai.result ? (
          <>
            <Button
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (onApplyPolished?.(ai.sentence!, ai.result!) ? onClose() : setAi({ phase: "error", sentence: ai.sentence, error: "그 사이 글이 바뀌어서 적용하지 않았어요." }))}
            >
              적용
            </Button>
            <Button size="sm" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={startPolish}>
              다시
            </Button>
          </>
        ) : ai.phase === "running" ? (
          <Button size="sm" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={cancelPolish}>
            취소
          </Button>
        ) : (
          <>
            {issue.source === "style" && getSentence && onApplyPolished && (
              <Button size="sm" variant="outline" aria-label="AI로 다듬기" onMouseDown={(event) => event.preventDefault()} onClick={startPolish}>
                <Sparkles className="size-3.5" /> AI로 다듬기
              </Button>
            )}
          </>
        )}
        {ai.phase !== "done" && ai.phase !== "running" && !issue.noFix && (
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
