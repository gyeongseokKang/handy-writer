import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";
import { goalProgress, textStats, type WritingGoal } from "@shared/text-stats";

const BLOCK = "\n";
const fmt = (n: number) => n.toLocaleString("ko-KR");

interface TextCountProps {
  editor: Editor;
  goal: WritingGoal | null;
  /** null이면 목표를 지운다. 글의 frontmatter(`goal:`)에 저장된다. */
  onGoalChange: (goal: WritingGoal | null) => void;
}

/** 아래 막대의 글자 수와 목표 분량. 누르면 원고지 매수 같은 자세한 수치와 목표 설정 창이 열린다. */
export function TextCount({ editor, goal, onGoalChange }: TextCountProps) {
  const { total, selected } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { from, to, empty } = e.state.selection;
      return {
        total: textStats(e.state.doc.textBetween(0, e.state.doc.content.size, BLOCK, " ")),
        selected: empty ? null : textStats(e.state.doc.textBetween(from, to, BLOCK, " ")),
      };
    },
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const progress = goal ? goalProgress(total, goal) : 0;
  const done = goal !== null && progress >= 1;
  const current = goal?.unit === "sheets" ? `${total.sheets}매` : `${fmt(total.chars)}자`;
  const label = goal
    ? `${current} / ${goal.unit === "sheets" ? `${goal.value}매` : `${fmt(goal.value)}자`}`
    : `${fmt(total.chars)}자 · 약 ${total.readMinutes}분`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`글자 수 ${label}`}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex items-center gap-1.5 rounded px-1.5 py-0.5 tabular-nums hover:bg-accent", open && "bg-accent")}
      >
        {selected && selected.chars > 0 && <span>선택 {fmt(selected.chars)}자 /</span>}
        <span className={cn(done && "text-emerald-600 dark:text-emerald-400")}>{label}</span>
        {goal && (
          <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full bg-primary transition-[width] duration-300", done && "bg-emerald-500")} style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </span>
        )}
      </button>
      {open && <StatsPopover total={total} goal={goal} progress={progress} onGoalChange={onGoalChange} />}
    </div>
  );
}

function StatsPopover({ total, goal, progress, onGoalChange }: { total: ReturnType<typeof textStats>; goal: WritingGoal | null; progress: number; onGoalChange: TextCountProps["onGoalChange"] }) {
  const [unit, setUnit] = useState<WritingGoal["unit"]>(goal?.unit ?? "chars");
  const [value, setValue] = useState(goal ? String(goal.value) : "");
  const parsed = Number(value.replace(/,/g, ""));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const save = () => valid && onGoalChange({ unit, value: unit === "sheets" ? Math.round(parsed * 10) / 10 : Math.round(parsed) });

  const rows: [string, string][] = [
    ["공백 포함", `${fmt(total.chars)}자`],
    ["공백 제외", `${fmt(total.charsNoSpace)}자`],
    ["200자 원고지", `${total.sheets}매`],
    ["읽는 시간", `약 ${total.readMinutes}분`],
  ];

  return (
    <div role="dialog" aria-label="글자 수와 목표 분량" className="absolute bottom-full left-0 z-40 mb-2 w-72 space-y-3 rounded-lg border bg-card p-3 text-sm text-foreground shadow-lg">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">원고지 매수는 문단마다 첫 칸을 비우고 새 줄에서 시작하는 규칙으로 셌어요.</p>
      <form
        className="space-y-2 border-t pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">목표 분량</span>
          {goal && <span className="text-xs text-muted-foreground tabular-nums">{Math.round(progress * 100)}% 달성</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            aria-label="목표 분량"
            inputMode="decimal"
            value={value}
            placeholder={unit === "sheets" ? "예: 15" : "예: 3000"}
            onChange={(event) => setValue(event.target.value)}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select aria-label="목표 단위" value={unit} onChange={(event) => setUnit(event.target.value as WritingGoal["unit"])} className="rounded-md border bg-background px-1.5 py-1">
            <option value="chars">자 (공백 포함)</option>
            <option value="sheets">매 (원고지)</option>
          </select>
        </div>
        <div className="flex justify-end gap-1.5">
          {goal && (
            <button type="button" onClick={() => onGoalChange(null)} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent">
              목표 지우기
            </button>
          )}
          <button type="submit" disabled={!valid} className="rounded-md bg-primary px-2.5 py-1 text-primary-foreground disabled:opacity-50">
            목표 저장
          </button>
        </div>
        <p className="text-xs text-muted-foreground">글의 frontmatter에 `goal: 3000` 또는 `goal: 15매`로 저장돼요.</p>
      </form>
    </div>
  );
}
