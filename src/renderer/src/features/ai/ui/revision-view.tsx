import { ArrowRight, Check, Copy, CopyPlus, Lightbulb, ListChecks, ListTree, Loader2, ScanText, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { diffVersions } from "@/shared/lib/text-diff";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { parseRevisionNote } from "@shared/ai-prompt";

import { changeCount, composeRevision, linkNotesToChanges, revisionPieces, type RevisionPiece } from "../model/revision-chunks";
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
  // 수정마다 적용할지 고른다 (처음엔 모두 적용). 고른 것만 넣은 글을 만든다.
  const pieces = useMemo(() => (shown && done && run.context ? revisionPieces(run.context.text, run.output) : []), [shown, done, run.context, run.output]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  useEffect(() => setRejected(new Set()), [run.id]);
  // 고친 점 카드를 누르면 그 수정들로 스크롤하고 잠깐 강조한다.
  const [flash, setFlash] = useState<{ ids: number[]; seq: number } | null>(null);
  const total = changeCount(pieces);
  const chosen = useMemo(() => composeRevision(pieces, (id) => !rejected.has(id)), [pieces, rejected]);
  const toggle = (id: number) => setRejected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const stats = useMemo(() => (shown && done && run.context ? diffVersions(run.context.text, chosen, false) : null), [shown, done, run.context, chosen]);

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
  const copy = () => void navigator.clipboard.writeText(chosen).then(() => toast.success("고른 수정을 넣은 글을 복사했어요."));
  const applied = total - rejected.size;

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
          {done && total > 0 && (
            <span className="flex items-center gap-1.5 text-sm">
              <span aria-label="적용할 수정" className="text-muted-foreground tabular-nums">수정 {applied}/{total}개 적용</span>
              <button type="button" className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" disabled={rejected.size === 0} onClick={() => setRejected(new Set())}>모두 적용</button>
              <button type="button" className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40" disabled={applied === 0} onClick={() => setRejected(new Set(pieces.flatMap((p) => (p.kind === "change" ? [p.id] : []))))}>모두 빼기</button>
            </span>
          )}
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
              <ChoosableDiff pieces={pieces} rejected={rejected} onToggle={toggle} collapse={collapse} flash={flash} />
            ) : (
              <p className="text-sm leading-7 whitespace-pre-wrap text-muted-foreground">{run.output || "글 전체를 다시 읽고 있어요…"}</p>
            )}
          </div>
        </article>
        {done && <RevisionSide notes={run.notes} suggestions={run.suggestions} before={run.context.text} after={run.output} pieces={pieces} rejected={rejected} setRejected={setRejected} onFocusChanges={setFlash} />}
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
              <Button size="sm" variant="outline" onClick={() => apply("below", chosen)}><CopyPlus /> 아래에 삽입</Button>
              <Button size="sm" disabled={total > 0 && applied === 0} onClick={() => apply("replace", chosen)}>
                <Check /> {total > 0 && applied < total ? `고른 ${applied}개만 ${scope}에 적용` : `${scope}에 적용`}
              </Button>
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
function RevisionSide({ notes, suggestions, before, after, pieces, rejected, setRejected, onFocusChanges }: {
  notes: string[]; suggestions: string[]; before: string; after: string;
  pieces: RevisionPiece[]; rejected: Set<number>; setRejected: (next: Set<number>) => void;
  onFocusChanges: (focus: { ids: number[]; seq: number }) => void;
}) {
  const toc = useMemo(() => compareToc(before, after), [before, after]);
  const parsed = useMemo(() => notes.map(parseRevisionNote), [notes]);
  const links = useMemo(() => linkNotesToChanges(pieces, before, after, parsed), [pieces, before, after, parsed]);
  const seq = useRef(0);
  const focus = (ids: number[]) => onFocusChanges({ ids, seq: ++seq.current });
  const setCard = (ids: number[], on: boolean) => {
    const next = new Set(rejected);
    for (const id of ids) {
      if (on) next.delete(id);
      else next.add(id);
    }
    setRejected(next);
  };
  const tocChanged = toc.some((row) => row.kind !== "same");
  return (
    <aside aria-label="퇴고 보고" className="hidden w-96 shrink-0 space-y-5 overflow-y-auto rounded-xl border bg-card p-4 shadow-sm lg:block">
      {notes.length > 0 && (
        <Section label="퇴고에서 고친 점" icon={<ListChecks className="size-4" />} title="고친 점" count={notes.length}>
          <ol className="space-y-2">
            {parsed.map((note, i) => {
              const ids = links[i] ?? [];
              const linked = ids.length > 0;
              const on = linked && ids.every((id) => !rejected.has(id));
              const partly = linked && !on && ids.some((id) => !rejected.has(id));
              return (
                <li
                  key={i}
                  aria-label={`고친 점 ${i + 1}`}
                  className={cn("group/note flex gap-2 rounded-md border bg-background px-2.5 py-2 text-[13px] leading-5 transition-opacity", linked && "cursor-pointer hover:border-primary/40", linked && !on && !partly && "opacity-55")}
                  onClick={() => linked && focus(ids)}
                  title={linked ? "누르면 본문의 그 자리로 가요" : "본문에서 정확한 자리를 찾지 못했어요. 가운데에서 직접 골라 주세요"}
                >
                  <div className="min-w-0 flex-1">
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
                    {!linked && <p className="mt-0.5 text-[11px] text-muted-foreground/70">본문 위치를 못 찾았어요</p>}
                  </div>
                  {linked && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`고친 점 ${i + 1} ${on ? "빼기" : "넣기"}`}
                      title={on ? "이 수정을 빼요 (원문 그대로)" : "이 수정을 넣어요"}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCard(ids, !on);
                        focus(ids);
                      }}
                      className={cn(
                        "h-6 shrink-0 self-start rounded-full border px-2 text-[11px] font-medium transition-colors",
                        on ? "border-primary bg-primary text-primary-foreground" : partly ? "border-primary/50 text-primary" : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {on ? "넣음" : partly ? "일부" : "뺌"}
                    </button>
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

/** 바뀐 부분만 볼 때 수정에서 멀리 떨어진 같은 글은 앞뒤 몇 줄만 남긴다. */
const KEEP_LINES = 2;

function SameText({ text, collapse, first, last }: { text: string; collapse: boolean; first: boolean; last: boolean }) {
  if (!collapse) return <>{text}</>;
  const lines = text.split("\n");
  const head = first ? 0 : KEEP_LINES;
  const tail = last ? 0 : KEEP_LINES;
  if (lines.length <= head + tail + 1) return <>{text}</>;
  return (
    <>
      {lines.slice(0, head).join("\n")}
      {head > 0 && "\n"}
      <span className="my-1 block border-y border-dashed py-0.5 text-xs text-muted-foreground select-none">⋯ {lines.length - head - tail}줄 같음</span>
      {lines.slice(lines.length - tail).join("\n")}
    </>
  );
}

/**
 * 고를 수 있는 diff: 수정 하나하나를 눌러 적용·빼기를 바꾼다.
 * 적용한 수정은 지운 글(빨강 취소선)과 넣은 글(초록), 뺀 수정은 원문 그대로 두고 고친 글을 흐리게 보여 준다.
 */
function ChoosableDiff({ pieces, rejected, onToggle, collapse, flash }: { pieces: RevisionPiece[]; rejected: Set<number>; onToggle: (id: number) => void; collapse: boolean; flash: { ids: number[]; seq: number } | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState<number[]>([]);
  useEffect(() => {
    if (!flash || flash.ids.length === 0) return;
    ref.current?.querySelector<HTMLElement>(`[data-change-id="${flash.ids[0]}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setLit(flash.ids);
    const timer = window.setTimeout(() => setLit([]), 1600);
    return () => window.clearTimeout(timer);
  }, [flash]);
  return (
    <div ref={ref} aria-label="고를 수 있는 바뀐 점" className="text-[15px] leading-7 break-words whitespace-pre-wrap">
      {pieces.map((piece, index) => {
        if (piece.kind === "same") return <SameText key={index} text={piece.text} collapse={collapse} first={index === 0} last={index === pieces.length - 1} />;
        const on = !rejected.has(piece.id);
        return (
          <span
            key={index}
            data-change-id={piece.id}
            role="checkbox"
            aria-checked={on}
            aria-label={`수정 ${piece.id + 1}: ${piece.removed.trim() || "(없음)"} → ${piece.added.trim() || "(삭제)"}`}
            tabIndex={0}
            title={on ? "누르면 이 수정을 빼요 (원문 그대로)" : "누르면 이 수정을 다시 적용해요"}
            onClick={() => onToggle(piece.id)}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onToggle(piece.id);
              }
            }}
            className={cn(
              "cursor-pointer rounded-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
              lit.includes(piece.id) && "ring-2 ring-amber-400 ring-offset-1",
              on ? "hover:ring-1 hover:ring-primary/40" : "border border-dashed border-muted-foreground/50 bg-muted hover:border-primary/50",
            )}
          >
            {on ? (
              <>
                {piece.removed && <del className="bg-red-500/15 text-red-700 decoration-red-500/70 dark:text-red-400">{piece.removed}</del>}
                {piece.added && <ins className="bg-emerald-500/15 text-emerald-800 no-underline dark:text-emerald-300">{piece.added}</ins>}
              </>
            ) : (
              <>
                {piece.removed}
                {piece.added && <span className="text-muted-foreground/60 line-through decoration-muted-foreground/40">{piece.added}</span>}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
