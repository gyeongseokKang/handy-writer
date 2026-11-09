import { ArrowRight, Check, Copy, CopyPlus, Lightbulb, ListChecks, ListTree, Loader2, ScanText, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { diffVersions } from "@/shared/lib/text-diff";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { DiffBody } from "@/shared/ui/diff-body";

import { parseRevisionNote } from "@shared/ai-prompt";

import { compareToc } from "../model/revision-toc";
import { useAiStore } from "../model/use-ai-store";

/**
 * 퇴고 결과를 변경 기록처럼 본문 자리에 크게 보여 준다: 원문과 고친 글의 차이(추가 초록·삭제 빨강)와 고친 점 목록.
 * 여기서 바로 본문에 적용하거나, 아래에 넣거나, 닫는다. 쓰는 동안에는 받은 글을 그대로 흘려 보여 준다.
 */
export function RevisionView() {
  const run = useAiStore((s) => s.run);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [collapse, setCollapse] = useState(false);
  const shown = run.task === "revise" && run.phase !== "idle" && !!run.context && run.notePath === activePath;
  const done = run.phase === "done";
  const stats = useMemo(() => (shown && done && run.context ? diffVersions(run.context.text, run.output, false) : null), [shown, done, run.context, run.output]);

  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      const { run: current, cancel, dismiss } = useAiStore.getState();
      if (current.phase === "running") void cancel();
      else dismiss();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [shown]);

  if (!shown || !run.context) return null;
  const { apply, cancel, dismiss } = useAiStore.getState();
  const scope = run.context.hasSelection ? "선택 부분" : "본문 전체";
  const copy = () => void navigator.clipboard.writeText(run.output).then(() => toast.success("고친 글을 복사했어요."));

  return (
    <div role="dialog" aria-modal="true" aria-label="퇴고 결과" className="history-view fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <header className="flex items-center gap-3 border-b px-5 py-2.5">
        <ScanText className="size-4 text-muted-foreground" />
        <h2 className="min-w-0 truncate font-semibold">
          퇴고 <span className="font-normal text-muted-foreground">· {run.context.noteName} · {scope}</span>
        </h2>
        {run.phase === "running" && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {run.status || "고치는 중…"}
          </span>
        )}
        {stats && (
          <span className="flex gap-2 text-sm font-medium tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{stats.added.toLocaleString("ko-KR")}자</span>
            <span className="text-red-600 dark:text-red-400">−{stats.removed.toLocaleString("ko-KR")}자</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {done && (
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
              바뀐 부분만
            </label>
          )}
          <button type="button" aria-label="퇴고 닫기" title="닫기 (Esc)" onClick={() => (run.phase === "running" ? void cancel() : dismiss())} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 justify-center gap-5 overflow-hidden px-5 py-5">
        <article aria-label="원문과 고친 글" className="flex min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {run.phase === "error" ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm whitespace-pre-wrap">{run.error}</p>
            ) : done ? (
              <DiffBody before={run.context.text} after={run.output} collapse={collapse} active />
            ) : (
              <p className="text-sm leading-7 whitespace-pre-wrap text-muted-foreground">{run.output || "글 전체를 다시 읽고 있어요…"}</p>
            )}
          </div>
        </article>
        {done && <RevisionSide notes={run.notes} suggestions={run.suggestions} before={run.context.text} after={run.output} />}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        {done && (run.notes.length > 0 || run.suggestions.length > 0) && (
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground lg:hidden">고친 점 {run.notes.length} · 제안 {run.suggestions.length} — 창을 넓히면 오른쪽에 보여요</p>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {run.phase === "running" && <Button size="sm" variant="outline" onClick={() => void cancel()}><Square /> 중지</Button>}
          {done && (
            <>
              <Button size="sm" variant="outline" onClick={copy}><Copy /> 복사</Button>
              <Button size="sm" variant="outline" onClick={() => apply("below")}><CopyPlus /> 아래에 삽입</Button>
              <Button size="sm" onClick={() => apply("replace")}><Check /> {scope}에 적용</Button>
            </>
          )}
          {run.phase === "error" && <Button size="sm" variant="outline" onClick={dismiss}>닫기</Button>}
        </div>
      </footer>
    </div>
  );
}

function Section({ icon, title, count, children, label }: { icon: React.ReactNode; title: string; count?: number; children: React.ReactNode; label: string }) {
  return (
    <section aria-label={label} className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        {icon} {title}
        {count !== undefined && <span className="font-normal text-muted-foreground tabular-nums">{count}</span>}
      </p>
      {children}
    </section>
  );
}

/** 오른쪽 칸: 고친 점(원문 → 수정 / 이유), 제안(적용 안 함), 수정 전·후 목차 */
function RevisionSide({ notes, suggestions, before, after }: { notes: string[]; suggestions: string[]; before: string; after: string }) {
  const toc = useMemo(() => compareToc(before, after), [before, after]);
  const tocChanged = toc.some((row) => row.kind !== "same");
  return (
    <aside aria-label="퇴고 보고" className="hidden w-96 shrink-0 space-y-5 overflow-y-auto rounded-xl border bg-card p-4 shadow-sm lg:block">
      {notes.length > 0 && (
        <Section label="퇴고에서 고친 점" icon={<ListChecks className="size-4" />} title="고친 점" count={notes.length}>
          <ol className="space-y-2">
            {notes.map((line, i) => {
              const note = parseRevisionNote(line);
              return (
                <li key={i} className="rounded-md border bg-background px-2.5 py-2 text-[13px] leading-5">
                  {note.before !== undefined ? (
                    <>
                      <p className="flex flex-wrap items-baseline gap-x-1.5">
                        <del className="text-red-700 decoration-red-400/70 dark:text-red-400">{note.before || "(없음)"}</del>
                        <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground" />
                        <ins className="text-emerald-700 no-underline dark:text-emerald-400">{note.after || "(삭제)"}</ins>
                      </p>
                      {note.reason && <p className="mt-0.5 text-xs text-muted-foreground">{note.reason}</p>}
                    </>
                  ) : (
                    <p>{note.text}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      )}
      {suggestions.length > 0 && (
        <Section label="퇴고 제안" icon={<Lightbulb className="size-4 text-amber-500" />} title="제안 · 적용 안 함" count={suggestions.length}>
          <ul className="space-y-2">
            {suggestions.map((line, i) => {
              const slash = line.lastIndexOf(" / ");
              return (
                <li key={i} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[13px] leading-5">
                  <p>{slash === -1 ? line : line.slice(0, slash)}</p>
                  {slash !== -1 && <p className="mt-0.5 text-xs text-muted-foreground">{line.slice(slash + 3)}</p>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {toc.length > 0 && (
        <Section label="수정 전·후 목차" icon={<ListTree className="size-4" />} title={tocChanged ? "목차 · 수정 전 → 후" : "목차 · 바뀌지 않음"}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            <p className="text-[11px] font-medium text-muted-foreground">수정 전</p>
            <p className="text-[11px] font-medium text-muted-foreground">수정 후</p>
            {toc.map((row, i) => (
              <div key={i} className="contents">
                {[row.before, row.after].map((h, side) => (
                  <p
                    key={side}
                    style={{ paddingLeft: h ? (h.level - 2) * 10 : 0 }}
                    className={cn(
                      "truncate rounded px-1 py-0.5",
                      !h && "text-muted-foreground/50",
                      row.kind !== "same" && h && (side === 0 ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"),
                    )}
                    title={h?.text}
                  >
                    {h ? h.text : "—"}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}
      {notes.length === 0 && suggestions.length === 0 && toc.length === 0 && <p className="text-sm text-muted-foreground">AI가 고친 점을 따로 적지 않았어요.</p>}
    </aside>
  );
}
