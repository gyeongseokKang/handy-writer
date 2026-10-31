import { ArrowDown, ArrowUp, BookOpen, GripVertical, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { EXPORT_FORMATS, type ExportFormat } from "@shared/export";
import { splitFrontmatter } from "@shared/frontmatter";
import { EMPTY_MANUSCRIPT, orderChapters, relativeTo, type ManuscriptConfig } from "@shared/manuscript";
import { manuscriptSheets, textStats } from "@shared/text-stats";

import { exportManuscript } from "../lib/manuscript-export";

const formatNumber = (n: number) => n.toLocaleString("ko-KR");

/** 원고 폴더 안 글들의 글자 수. 글이 저장되면(mtime이 바뀌면) 다시 센다. */
function useChapterCounts(paths: { path: string; mtime: number }[]) {
  const [counts, setCounts] = useState<Record<string, { chars: number; sheets: number }>>({});
  const key = paths.map((p) => `${p.path}:${p.mtime}`).join("\n");
  useEffect(() => {
    let alive = true;
    void Promise.all(
      paths.map(async ({ path }) => {
        const body = splitFrontmatter(await api.notes.read(path).catch(() => "")).body;
        return [path, { chars: textStats(body).chars, sheets: manuscriptSheets(body) }] as const;
      }),
    ).then((entries) => alive && setCounts(Object.fromEntries(entries)));
    return () => {
      alive = false;
    };
    // key가 paths의 내용을 대신한다.
  }, [key]);
  return counts;
}

/** 폴더 하나를 책 한 권처럼: 장 순서를 정하고, 분량을 보고, 한 파일로 내보낸다. */
export function ManuscriptDialog({ folder }: { folder: string }) {
  const close = () => useUiStore.getState().setManuscriptFolder(null);
  const notes = useWorkspaceStore((s) => s.notes);
  const root = useWorkspaceStore((s) => s.root);
  const [config, setConfig] = useState<ManuscriptConfig | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // 열릴 때 한 번만 창에 포커스를 둔다 (Esc로 닫히게). 다시 그릴 때마다 옮기면 입력 칸의 포커스를 빼앗는다.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => dialogRef.current?.focus(), []);
  const name = folder ? (folder.split("/").pop() ?? folder) : (root?.split(/[\\/]/).filter(Boolean).pop() ?? "원고");

  useEffect(() => {
    let alive = true;
    api.manuscripts.get().then(
      (all) => alive && setConfig(all[folder] ?? EMPTY_MANUSCRIPT),
      () => alive && setConfig(EMPTY_MANUSCRIPT),
    );
    return () => {
      alive = false;
    };
  }, [folder]);

  const chapters = useMemo(() => (config ? orderChapters(folder, notes, config) : []), [config, folder, notes]);
  const counts = useChapterCounts(useMemo(() => chapters.map((c) => c.note), [chapters]));
  const included = chapters.filter((c) => c.included);
  const total = included.reduce((sum, c) => sum + (counts[c.note.path]?.chars ?? 0), 0);
  const sheets = Math.round(included.reduce((sum, c) => sum + (counts[c.note.path]?.sheets ?? 0), 0) * 10) / 10;
  const goal = config?.goal ?? null;

  const save = (next: ManuscriptConfig) => {
    setConfig(next);
    api.manuscripts.set(folder, next).catch((error: unknown) => toast.error(`원고 설정을 저장하지 못했어요: ${error instanceof Error ? error.message : String(error)}`));
  };
  const reorder = (from: number, to: number) => {
    if (!config || to < 0 || to >= chapters.length || from === to) return;
    const order = chapters.map((c) => relativeTo(folder, c.note.path));
    const [moved] = order.splice(from, 1);
    if (moved === undefined) return;
    order.splice(to, 0, moved);
    save({ ...config, order });
  };
  const toggle = (path: string) => {
    if (!config) return;
    const rel = relativeTo(folder, path);
    save({ ...config, excluded: config.excluded.includes(rel) ? config.excluded.filter((p) => p !== rel) : [...config.excluded, rel] });
  };

  const run = async (format: ExportFormat) => {
    if (busy || included.length === 0) return;
    setBusy(true);
    try {
      const saved = await exportManuscript(name, folder, included.map((c) => c.note), format);
      if (saved) toast.success("원고를 내보냈어요.", { description: saved, action: { label: "위치 보기", onClick: () => void api.export.reveal(saved) } });
    } catch (error) {
      toast.error(`원고를 내보내지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[6vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`원고: ${name}`}
        tabIndex={-1}
        ref={dialogRef}
        className="flex max-h-[88vh] w-full max-w-xl flex-col gap-3 rounded-xl border bg-card px-6 py-5 text-sm shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
            <BookOpen className="size-4 shrink-0" />
            <span className="truncate">원고: {name}</span>
          </h2>
          <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">이 폴더의 글을 장으로 묶어요. 끌거나 화살표로 순서를 바꾸고, 체크를 풀면 원고에서 빠져요. 순서는 작업 폴더의 .handy-writer/manuscripts.json에 남아요.</p>

        <section aria-label="원고 분량" className="space-y-1.5 rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span role="status" aria-label="원고 전체 분량" className="text-base font-semibold tabular-nums">
              {formatNumber(total)}자
            </span>
            <span className="text-xs text-muted-foreground">
              장 {included.length}개 · 원고지 {formatNumber(sheets)}매
            </span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              목표
              <input
                aria-label="원고 목표 분량"
                inputMode="numeric"
                placeholder="글자 수"
                defaultValue={goal ?? ""}
                key={goal ?? "none"}
                onBlur={(event) => {
                  if (!config) return;
                  const value = Number(event.target.value.replace(/[,\s]/g, ""));
                  const next = Number.isFinite(value) && value > 0 ? Math.round(value) : null;
                  if (next !== config.goal) save({ ...config, goal: next });
                }}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                className="w-24 rounded border bg-background px-1.5 py-0.5 text-right text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              자
            </label>
          </div>
          {goal && (
            <div className="flex items-center gap-2">
              <div role="progressbar" aria-label="원고 진행률" aria-valuenow={Math.round((total / goal) * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div className={cn("h-full rounded-full bg-primary", total >= goal && "bg-emerald-500")} style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round((total / goal) * 100)}%</span>
            </div>
          )}
        </section>

        <ol aria-label="장 목록" className="min-h-0 flex-1 space-y-px overflow-y-auto">
          {config === null && <li className="py-6 text-center text-muted-foreground">불러오는 중…</li>}
          {config !== null && chapters.length === 0 && <li className="py-6 text-center text-muted-foreground">이 폴더에 글이 없어요.</li>}
          {chapters.map(({ note, included: on }, index) => {
            const count = counts[note.path];
            const number = on ? chapters.slice(0, index + 1).filter((c) => c.included).length : null;
            const rel = relativeTo(folder, note.path);
            const label = rel.includes("/") ? rel.replace(/\.md$/, "") : note.name;
            return (
              <li
                key={note.path}
                draggable
                onDragStart={(event) => {
                  setDragging(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => dragging !== null && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null) reorder(dragging, index);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                className={cn("group flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-accent/60", dragging === index && "opacity-50", !on && "text-muted-foreground")}
              >
                <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60" />
                <input type="checkbox" checked={on} onChange={() => toggle(note.path)} aria-label={`${label} 원고에 넣기`} />
                <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{number ?? "–"}</span>
                <button
                  type="button"
                  onClick={() => {
                    void useWorkspaceStore.getState().openNote(note.path);
                    close();
                  }}
                  title={`${note.path} 열기`}
                  className={cn("min-w-0 flex-1 truncate text-left hover:underline", !on && "line-through")}
                >
                  {label}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count ? `${formatNumber(count.chars)}자` : ""}</span>
                <button type="button" aria-label={`${label} 위로`} disabled={index === 0} onClick={() => reorder(index, index - 1)} className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" aria-label={`${label} 아래로`} disabled={index === chapters.length - 1} onClick={() => reorder(index, index + 1)} className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">{busy ? "내보내는 중…" : "한 파일로 내보내기"}</span>
          <div role="group" aria-label="원고 내보내기" className="ml-auto flex flex-wrap gap-1.5">
            {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
              <Button key={format} size="sm" variant="outline" className="h-7" disabled={busy || included.length === 0} onClick={() => void run(format)}>
                {EXPORT_FORMATS[format].label.replace(/ \(.*\)$/, "")}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
