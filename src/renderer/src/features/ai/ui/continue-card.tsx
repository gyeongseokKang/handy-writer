import type { Editor } from "@tiptap/core";
import { CopyPlus, Loader2, RotateCcw, Square, TextCursorInput, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/button";

import { useAiStore } from "../model/use-ai-store";

const WIDTH = 420;
const MARGIN = 8;

/**
 * 이어쓰기 결과를 커서 바로 아래 작은 창으로 보여 준다 (문장 다듬기 창과 같은 모양).
 * 오른쪽 패널을 보지 않아도 그 자리에서 읽고 이어 붙이거나, 다시 쓰게 하거나, 닫는다.
 */
export function ContinueCard({ editor, path }: { editor: Editor; path: string }) {
  const run = useAiStore((s) => s.run);
  const [, setTick] = useState(0);
  const shown = run.task === "continue" && run.notePath === path && run.phase !== "idle" && !!run.context;

  // 스크롤하거나 창 크기가 바뀌면 커서 자리를 다시 잰다.
  useEffect(() => {
    if (!shown) return;
    const again = () => setTick((n) => n + 1);
    window.addEventListener("scroll", again, true);
    window.addEventListener("resize", again);
    return () => {
      window.removeEventListener("scroll", again, true);
      window.removeEventListener("resize", again);
    };
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const { run: current, cancel, dismiss } = useAiStore.getState();
      if (current.phase === "running") void cancel();
      else dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shown]);

  if (!shown || editor.isDestroyed) return null;

  let coords: { left: number; top: number; bottom: number };
  try {
    coords = editor.view.coordsAtPos(Math.min(run.context!.cursor, editor.state.doc.content.size));
  } catch {
    return null;
  }
  const left = Math.max(MARGIN, Math.min(coords.left - 16, window.innerWidth - WIDTH - MARGIN));
  // 아래 자리가 모자라면 커서 위로 띄운다.
  const below = window.innerHeight - coords.bottom > 260;
  const position = below ? { top: coords.bottom + 6 } : { bottom: window.innerHeight - coords.top + 6 };
  const { apply, cancel, dismiss, start } = useAiStore.getState();
  const keep = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      role="dialog"
      aria-label="이어쓰기 결과"
      style={{ position: "fixed", left, width: WIDTH, zIndex: 40, ...position }}
      className="space-y-2 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
    >
      <div className="flex items-center gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300">
          {run.phase === "running" && <Loader2 className="size-3.5 animate-spin" />}
          이어쓰기
          <span className="font-normal text-muted-foreground">{run.phase === "running" ? (run.status || "쓰는 중…") : run.phase === "done" ? "커서 뒤에 이어 붙일 글" : "실패"}</span>
        </p>
        <button type="button" aria-label="이어쓰기 닫기" title="닫기 (Esc)" onMouseDown={keep} onClick={() => (run.phase === "running" ? void cancel() : dismiss())} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </div>
      {run.phase === "error" ? (
        <p role="alert" className="text-xs whitespace-pre-wrap text-destructive">{run.error}</p>
      ) : (
        <p aria-label="이어쓸 글" className="max-h-56 overflow-y-auto rounded-md bg-muted/60 p-2 text-sm leading-6 break-words whitespace-pre-wrap">
          {run.output || <span className="text-muted-foreground">…</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {run.phase === "running" && (
          <Button size="sm" variant="outline" onMouseDown={keep} onClick={() => void cancel()}><Square /> 중지</Button>
        )}
        {run.phase === "done" && (
          <>
            <Button size="sm" onMouseDown={keep} onClick={() => apply("cursor")} title="커서가 있던 자리에 바로 이어서 써 넣어요"><TextCursorInput /> 이어 붙이기</Button>
            <Button size="sm" variant="outline" onMouseDown={keep} onClick={() => apply("below")}><CopyPlus /> 아래 문단으로</Button>
          </>
        )}
        {run.phase !== "running" && (
          <Button size="sm" variant="outline" onMouseDown={keep} onClick={() => void start("continue")} title="같은 자리에서 다시 쓰게 해요"><RotateCcw /> 다시</Button>
        )}
      </div>
    </div>
  );
}
