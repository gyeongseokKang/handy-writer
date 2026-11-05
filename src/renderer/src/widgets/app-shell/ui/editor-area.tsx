import { ArrowLeftRight, Columns2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { MAX_SPLITS, useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { NoteEditor } from "@/features/editor/ui/note-editor";
import { NOTE_DRAG_TYPE } from "@/shared/lib/note-drag";
import { cn } from "@/shared/lib/utils";
import { ResizeGrip } from "@/shared/ui/resize-grip";

const SPLIT_KEY = "handy-writer:split-ratio";
const SPLIT3_KEY = "handy-writer:split-ratios-3";
/** 한 칸이 이보다 좁아지지 않게 한다 */
const MIN_FRACTION = 0.15;

function readFractions(count: number): number[] {
  const equal = Array.from({ length: count }, () => 1 / count);
  try {
    if (count === 2) {
      const value = Number(localStorage.getItem(SPLIT_KEY));
      return value >= 0.25 && value <= 0.75 ? [value, 1 - value] : equal;
    }
    if (count === 3) {
      const saved = JSON.parse(localStorage.getItem(SPLIT3_KEY) ?? "null") as unknown;
      if (Array.isArray(saved) && saved.length === 3 && saved.every((v) => typeof v === "number" && v >= MIN_FRACTION)) return saved as number[];
    }
  } catch {
    // 저장소를 못 써도 괜찮다.
  }
  return equal;
}

function saveFractions(fractions: number[]) {
  try {
    if (fractions.length === 2) localStorage.setItem(SPLIT_KEY, String(fractions[0]));
    if (fractions.length === 3) localStorage.setItem(SPLIT3_KEY, JSON.stringify(fractions));
  } catch {
    // 저장소를 못 써도 괜찮다.
  }
}

/** 나란히 띄운 글. 편집·저장은 가운데와 같고, 머리줄에서 가운데와 자리 바꾸기와 닫기를 한다. */
function SidePane({ path, name }: { path: string; name: string }) {
  useEffect(() => () => {
    if (useUiStore.getState().focusedPane === path) useUiStore.getState().setFocusedPane("main");
  }, [path]);
  const ws = useWorkspaceStore.getState();
  return (
    <section aria-label={`옆에 연 글: ${name}`} className="flex h-full min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b bg-muted/30 pr-1 pl-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <button type="button" title="가운데 글과 자리 바꾸기" aria-label="자리 바꾸기" onClick={() => void ws.swapSplit(path)} className="rounded p-1 hover:bg-accent">
          <ArrowLeftRight className="size-3.5" />
        </button>
        <button type="button" title="이 분할 화면 닫기" aria-label="분할 화면 닫기" onClick={() => void ws.closeSplit(path)} className="rounded p-1 hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <NoteEditor key={path} path={path} name={name} pane="side" />
      </div>
    </section>
  );
}

/** 끌어 놓을 자리: 칸 index(0 = 가운데 글)의 왼쪽/오른쪽 절반, 또는 가득 찼을 때 그 칸 바꾸기 */
type DropTarget = { pane: number; side: "left" | "right" | "replace" };

/** 글을 끌고 있는지 (탭·글 목록에서 시작한 끌기만) */
function useNoteDragging() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    // 끌기를 시작한 곳(글 목록)이 dragstart 전파를 막아서, 끄는 중에 지나가는 dragover로 알아챈다.
    const over = (event: DragEvent) => { if (event.dataTransfer?.types.includes(NOTE_DRAG_TYPE)) setDragging(true); };
    // 바로 끄면 자리 표시 칸이 놓기(drop)를 받기 전에 사라지므로 한 박자 늦춘다.
    const stop = () => window.setTimeout(() => setDragging(false), 0);
    window.addEventListener("dragover", over, true);
    window.addEventListener("dragend", stop, true);
    window.addEventListener("drop", stop, true);
    return () => {
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("dragend", stop, true);
      window.removeEventListener("drop", stop, true);
    };
  }, []);
  return dragging;
}

/**
 * 가운데 에디터와 나란히 띄운 글들 (최대 3분할). 칸 사이 경계를 끌어 너비를 바꾼다.
 * 탭이나 글 목록의 글을 이 영역으로 끌면 놓을 자리가 보이고, 놓으면 그 자리에 나란히 띄운다.
 */
export function EditorArea({ main }: { main: React.ReactNode }) {
  const splitPaths = useWorkspaceStore((s) => s.splitPaths);
  const notes = useWorkspaceStore((s) => s.notes);
  const sides = splitPaths.flatMap((path) => {
    const name = notes.find((note) => note.path === path)?.name;
    return name === undefined ? [] : [{ path, name }];
  });
  const count = sides.length + 1;
  const [fractions, setFractions] = useState(() => readFractions(count));
  const [resizing, setResizing] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragging = useNoteDragging();
  const [drop, setDrop] = useState<DropTarget | null>(null);

  // 칸 수가 바뀌면 그 칸 수의 너비로 다시 나눈다.
  useEffect(() => setFractions(readFractions(count)), [count]);
  useEffect(() => { if (!dragging) setDrop(null); }, [dragging]);

  const widths = fractions.length === count ? fractions : readFractions(count);

  const startResize = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const { width } = container.getBoundingClientRect();
    const startX = event.clientX;
    const start = [...widths];
    setResizing(index);
    let latest = start;
    const onMove = (e: PointerEvent) => {
      const pair = start[index]! + start[index + 1]!;
      const left = Math.min(pair - MIN_FRACTION, Math.max(MIN_FRACTION, start[index]! + (e.clientX - startX) / width));
      latest = start.map((f, i) => (i === index ? left : i === index + 1 ? pair - left : f));
      setFractions(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResizing(null);
      saveFractions(latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const nudge = (index: number, delta: number) => {
    const pair = widths[index]! + widths[index + 1]!;
    const left = Math.min(pair - MIN_FRACTION, Math.max(MIN_FRACTION, widths[index]! + delta));
    const next = widths.map((f, i) => (i === index ? left : i === index + 1 ? pair - left : f));
    setFractions(next);
    saveFractions(next);
  };
  const resetWidths = () => {
    const equal = Array.from({ length: count }, () => 1 / count);
    setFractions(equal);
    saveFractions(equal);
  };

  const full = sides.length >= MAX_SPLITS;
  const targetAt = (clientX: number): DropTarget | null => {
    for (let pane = 0; pane < count; pane++) {
      const rect = paneRefs.current[pane]?.getBoundingClientRect();
      if (!rect || clientX < rect.left || clientX > rect.right) continue;
      if (full) return { pane, side: "replace" };
      // 가운데 글 왼쪽에는 놓지 않는다 (가운데 글이 늘 맨 왼쪽).
      return { pane, side: pane === 0 || clientX > rect.left + rect.width / 2 ? "right" : "left" };
    }
    return null;
  };
  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move"; // 글 목록·탭이 move만 허용한다
    const next = targetAt(event.clientX);
    setDrop((prev) => (prev?.pane === next?.pane && prev?.side === next?.side ? prev : next));
  };
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const path = event.dataTransfer.getData(NOTE_DRAG_TYPE);
    const target = targetAt(event.clientX);
    setDrop(null);
    if (!path || !target) return;
    const ws = useWorkspaceStore.getState();
    if (target.side === "replace") {
      if (target.pane === 0) return void ws.openNote(path);
      return void ws.openSplit(path, target.pane - 1);
    }
    // 칸 index → 분할 목록 자리: 오른쪽 절반이면 그 칸 다음, 왼쪽 절반이면 그 칸 자리
    void ws.openSplit(path, target.side === "right" ? target.pane : target.pane - 1);
  };

  const panes: { key: string; node: React.ReactNode }[] = [
    { key: "main", node: main },
    ...sides.map((side) => ({ key: side.path, node: <SidePane path={side.path} name={side.name} /> })),
  ];

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1">
      {panes.map((pane, index) => (
        <div key={pane.key} className="contents">
          {index > 0 && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="분할 경계 (끌어서 너비 조절)"
              aria-valuenow={Math.round(widths[index - 1]! * 100)}
              tabIndex={0}
              title="끌어서 너비 조절 · 두 번 누르면 똑같이 나누기"
              onPointerDown={startResize(index - 1)}
              onDoubleClick={resetWidths}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") nudge(index - 1, -0.05);
                if (event.key === "ArrowRight") nudge(index - 1, 0.05);
              }}
              className={cn(
                "group/split relative z-10 w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary/60 focus-visible:outline-none",
                resizing === index - 1 && "bg-primary/60",
              )}
            >
              <ResizeGrip active={resizing === index - 1} className="group-hover/split:opacity-100" />
            </div>
          )}
          <div
            ref={(el) => { paneRefs.current[index] = el; }}
            className="relative flex min-w-0 flex-col"
            style={{ flex: count > 1 ? `${widths[index]} 1 0%` : "1 1 0%" }}
          >
            {pane.node}
            {resizing !== null && (
              <span className="pointer-events-none absolute top-2 right-2 z-20 rounded bg-foreground/70 px-1.5 py-0.5 text-[11px] text-background tabular-nums">
                {Math.round(widths[index]! * 100)}%
              </span>
            )}
          </div>
        </div>
      ))}
      {dragging && (
        <div aria-label="여기에 놓아 나란히 띄우기" className="absolute inset-0 z-30" onDragOver={onDragOver} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrop(null); }} onDrop={onDrop}>
          {drop && <DropPlaceholder target={drop} rect={paneRect(paneRefs.current[drop.pane], containerRef.current)} />}
        </div>
      )}
    </div>
  );
}

function paneRect(pane: HTMLDivElement | null | undefined, container: HTMLDivElement | null) {
  if (!pane || !container) return null;
  const p = pane.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return { left: p.left - c.left, width: p.width };
}

function DropPlaceholder({ target, rect }: { target: DropTarget; rect: { left: number; width: number } | null }) {
  if (!rect) return null;
  const half = target.side !== "replace";
  const left = target.side === "right" ? rect.left + rect.width / 2 : rect.left;
  const width = half ? rect.width / 2 : rect.width;
  return (
    <div
      data-testid="split-drop-placeholder"
      style={{ left: left + 6, width: width - 12 }}
      className="pointer-events-none absolute top-1.5 bottom-1.5 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/10 text-sm font-medium text-primary transition-all"
    >
      <span className="flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1 shadow-sm">
        <Columns2 className="size-4" />
        {half ? "여기에 나란히 띄우기" : "이 자리의 글 바꾸기 (최대 3분할)"}
      </span>
    </div>
  );
}
