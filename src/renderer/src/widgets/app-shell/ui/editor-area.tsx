import { ArrowLeftRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { NoteEditor } from "@/features/editor/ui/note-editor";

const SPLIT_KEY = "handy-writer:split-ratio";
const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;

function readRatio() {
  try {
    const value = Number(localStorage.getItem(SPLIT_KEY));
    return value >= MIN_RATIO && value <= MAX_RATIO ? value : 0.5;
  } catch {
    return 0.5;
  }
}

/** 오른쪽에 나란히 띄운 글. 편집·저장은 가운데와 같고, 머리줄에서 자리 바꾸기와 닫기를 한다. */
function SidePane({ path, name }: { path: string; name: string }) {
  useEffect(() => () => useUiStore.getState().setFocusedPane("main"), []);
  return (
    <section aria-label={`옆에 연 글: ${name}`} className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b bg-muted/30 pr-1 pl-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <button type="button" title="가운데 글과 자리 바꾸기" aria-label="자리 바꾸기" onClick={() => void useWorkspaceStore.getState().swapSplit()} className="rounded p-1 hover:bg-accent">
          <ArrowLeftRight className="size-3.5" />
        </button>
        <button type="button" title="분할 화면 닫기 (Ctrl/Cmd+\)" aria-label="분할 화면 닫기" onClick={() => void useWorkspaceStore.getState().openSplit(null)} className="rounded p-1 hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <NoteEditor key={path} path={path} name={name} pane="side" />
      </div>
    </section>
  );
}

/** 가운데 에디터와, 분할 화면이면 끌어서 너비를 바꾸는 경계와 오른쪽 에디터 */
export function EditorArea({ main }: { main: React.ReactNode }) {
  const splitPath = useWorkspaceStore((s) => s.splitPath);
  const splitName = useWorkspaceStore((s) => s.notes.find((note) => note.path === s.splitPath)?.name);
  const [ratio, setRatio] = useState(readRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const { left, width } = container.getBoundingClientRect();
    const onMove = (e: PointerEvent) => setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, (e.clientX - left) / width)));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setRatio((value) => {
        try {
          localStorage.setItem(SPLIT_KEY, String(value));
        } catch {
          // 저장소를 못 써도 괜찮다.
        }
        return value;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const split = splitPath !== null && splitName !== undefined;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-col" style={{ flex: split ? `0 0 ${ratio * 100}%` : "1 1 0%" }}>
        {main}
      </div>
      {split && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="분할 경계 (끌어서 너비 조절)"
            aria-valuenow={Math.round(ratio * 100)}
            tabIndex={0}
            onPointerDown={startResize}
            onDoubleClick={() => setRatio(0.5)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setRatio((r) => Math.max(MIN_RATIO, r - 0.05));
              if (event.key === "ArrowRight") setRatio((r) => Math.min(MAX_RATIO, r + 0.05));
            }}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary/60 focus-visible:outline-none"
          />
          <SidePane path={splitPath} name={splitName} />
        </>
      )}
    </div>
  );
}
