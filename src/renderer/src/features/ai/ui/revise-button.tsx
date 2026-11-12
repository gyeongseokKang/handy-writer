import { readNoteReviseRules, writeNoteReviseRules } from "@shared/note-revise-rules";
import { Plus, ScanText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { useAiStore } from "../model/use-ai-store";

const POPOVER_WIDTH = 320;

/**
 * 퇴고 버튼. 마우스를 올리면 왼쪽에 +가 나타나고, 누르면 이 글에만 적용할 퇴고 룰을 적는 창이 열린다.
 * 글에 퇴고 룰이 있으면 +가 늘 보이고 줄 수를 알려 준다. 룰은 글 속성 revise_rules에 저장된다.
 */
export function ReviseButton({ disabled }: { disabled: boolean }) {
  const frontmatter = useEditorBridge((s) => s.frontmatter);
  const hasNote = useEditorBridge((s) => s.bridge !== null);
  const saved = readNoteReviseRules(frontmatter);
  const lines = saved.split("\n").filter((l) => l.trim()).length;
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const t = event.target as Node;
      if (!popRef.current?.contains(t) && !ref.current?.contains(t)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openEditor = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setDraft(saved);
    setOpen({ left: Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)), top: rect.bottom + 6 });
  };
  const save = () => {
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return false;
    try {
      bridge.setFrontmatter(writeNoteReviseRules(bridge.getFrontmatter(), draft));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  return (
    <div ref={ref} className="group/revise relative">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled}
        onClick={() => void useAiStore.getState().prepare("revise")}
        title={`나의 퇴고 룰${lines ? `과 이 글의 퇴고 룰(${lines}줄)` : "(없으면 기본 기준)"}로 글을 다시 보고 빼고 고쳐요. 글 전체나 고른 절만, 선택한 채 누르면 그 부분만 퇴고해요`}
      >
        <ScanText /> 퇴고
        {lines > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">+{lines}</span>}
      </Button>
      {hasNote && (
        <button
          type="button"
          aria-label="이 글의 퇴고 룰"
          title={lines ? `이 글의 퇴고 룰 ${lines}줄 고치기` : "이 글에만 적용할 퇴고 룰 더하기"}
          onClick={openEditor}
          className={cn(
            "absolute top-1/2 left-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded border bg-background text-muted-foreground shadow-sm transition-opacity hover:text-foreground",
            lines > 0 || open ? "opacity-100" : "opacity-0 group-hover/revise:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Plus className="size-3" />
        </button>
      )}
      {open && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="이 글의 퇴고 룰"
          style={{ left: open.left, top: open.top, width: POPOVER_WIDTH }}
          className="fixed z-50 space-y-2 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold">이 글의 퇴고 룰</p>
            <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent"><X className="size-3.5" /></button>
          </div>
          <p className="text-xs text-muted-foreground">공통 퇴고 룰에 더해 이 글에만 적용돼요. 서로 부딪히면 이 글의 룰을 따라요.</p>
          <textarea
            autoFocus
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="이 글의 퇴고 룰 내용"
            placeholder={"예)\n- 요즘IT 기고 규칙: 소제목은 질문형으로\n- 3장은 사례 위주라 줄이지 않는다\n- 마지막 문단은 독자에게 묻는 문장으로"}
            className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">글 속성 <code>revise_rules</code>에 저장돼요</p>
            <Button size="sm" variant="outline" disabled={draft === saved} onClick={() => save() && (setOpen(null), toast.success("이 글의 퇴고 룰을 저장했어요."))}>저장</Button>
            <Button size="sm" disabled={disabled} onClick={() => { if (save()) { setOpen(null); window.setTimeout(() => void useAiStore.getState().prepare("revise"), 0); } }}>
              <ScanText /> 퇴고
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
