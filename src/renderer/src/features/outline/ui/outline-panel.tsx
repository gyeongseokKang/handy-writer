import { ListTree, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useOutlineStore } from "@/entities/note/model/use-outline-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/**
 * 에디터 왼쪽 위에 떠 있는 목차. 평소에는 지금 보고 있는 제목과 그 위 제목들(h1 → h2 → h3)만 보여주고,
 * 마우스를 올리거나 키보드로 들어오면 전체 목차를 펼친다. 누르면 그 제목으로 옮겨 간다.
 */
export function OutlinePanel() {
  const headings = useOutlineStore((s) => s.headings);
  const activePos = useOutlineStore((s) => s.activePos);
  const setDraftOpen = useUiStore((s) => s.setDraftOpen);

  // 가장 높은 제목 수준을 왼쪽 끝에 맞춘다 (## 부터 쓰는 글도 들여쓰기 없이 시작).
  const top = Math.min(...headings.map((h) => h.level), 6);
  const current = headings.find((h) => h.pos === activePos) ?? headings[0];
  const trail = useTrailLines(current ? headingTrail(headings, headings.indexOf(current)) : []);
  const navRef = useRef<HTMLElement>(null);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const editorWidth = useUiStore((s) => s.editorWidth);
  const compact = useCompact(navRef, `${activePath}:${editorWidth}`);

  return (
    <nav
      aria-label="목차"
      // 목록이 접혀 있으면 안의 버튼에 갈 수 없으므로, 목차 자체가 포커스를 받아 펼친다.
      tabIndex={0}
      ref={navRef}
      data-compact={compact || undefined}
      title={compact ? "목차" : undefined}
      className={cn(
        "outline-panel group outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 absolute z-10 w-max max-w-56 rounded-lg border bg-card/90 text-sm shadow-sm backdrop-blur hover:w-64 hover:max-w-64 focus-within:w-64 focus-within:max-w-64",
        compact ? "top-2 left-2" : "top-4 left-4",
      )}
    >
      {/* 접힌 모습: 지금 보고 있는 제목과 그 위 제목들 */}
      <div aria-hidden data-outline-current className={cn("flex gap-2 text-muted-foreground group-focus-within:hidden group-hover:hidden", compact ? "p-2" : "px-3 py-2")}>
        <ListTree className="mt-0.5 size-4 shrink-0" />
        <div className={cn("min-w-0 space-y-0.5", compact && "hidden")}>
          {trail.length === 0 ? (
            <div>목차</div>
          ) : (
            trail.map(({ heading, depth, last, leaving }) => (
              <div
                key={heading.pos}
                data-leaving={leaving || undefined}
                style={{ paddingLeft: `${depth * 0.75}rem` }}
                className={cn("outline-trail-line truncate", last ? "text-sm leading-5 text-foreground/80" : "text-xs leading-5")}
              >
                {heading.text}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 펼친 모습: 전체 목차 */}
      <div className="hidden p-2 group-focus-within:block group-hover:block">
        <p className="flex items-center gap-2 px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">
          <ListTree className="size-3.5" /> 목차
        </p>
        {headings.length === 0 ? (
          <div className="space-y-3 px-2 pb-2 text-muted-foreground">
            <p>글에 제목(#, ##)을 넣으면 여기에 목차가 생겨요.</p>
            <Button size="sm" variant="outline" onClick={() => setDraftOpen(true)}>
              <Sparkles /> AI로 목차·초안 만들기
            </Button>
          </div>
        ) : (
          <ol className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {headings.map((heading) => (
              <li key={heading.pos}>
                <button
                  type="button"
                  title={heading.text}
                  aria-current={heading.pos === current?.pos ? "location" : undefined}
                  onClick={() => useEditorBridge.getState().bridge?.focusHeading(heading.pos)}
                  style={{ paddingLeft: `${0.5 + (heading.level - top) * 0.875}rem` }}
                  className={cn(
                    "block w-full truncate rounded-md py-1 pr-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground",
                    heading.level === top && "font-medium text-foreground/80",
                    heading.pos === current?.pos && "bg-accent text-foreground",
                  )}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </nav>
  );
}

/** 접힌 목차가 글 칸 왼쪽 여백에 들어가지 않으면(글자를 가리면) 아이콘만 남긴다. */
const FULL_WIDTH = 224;
const GAP = 12;

function useCompact(navRef: React.RefObject<HTMLElement | null>, layoutKey: string) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const pane = navRef.current?.parentElement;
    if (!pane) return;
    const measure = () => {
      const column = pane.querySelector<HTMLElement>("[data-note-column]");
      if (!column) return;
      // 글이 시작하는 곳 = 글 칸 왼쪽 + 안쪽 여백
      const textLeft = column.getBoundingClientRect().left + parseFloat(getComputedStyle(column).paddingLeft || "0");
      const free = textLeft - pane.getBoundingClientRect().left;
      setCompact(free < FULL_WIDTH + 16 + GAP);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    // 글을 바꾸면 에디터가 다시 그려지므로, 그려진 뒤의 글 칸을 다시 찾아 지켜본다.
    const frame = window.requestAnimationFrame(() => {
      const column = pane.querySelector("[data-note-column]");
      if (column) observer.observe(column);
      measure();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [navRef, layoutKey]);
  return compact;
}

const LEAVE_MS = 180;

interface TrailLine<T> {
  heading: T;
  depth: number;
  last: boolean;
  leaving: boolean;
}

/** 이어진 제목 줄이 바뀔 때 빠지는 줄을 잠깐 남겨 두어 접히며 사라지게 한다. */
function useTrailLines<T extends { pos: number }>(trail: T[]): TrailLine<T>[] {
  const key = trail.map((h) => h.pos).join(",");
  const [lines, setLines] = useState<TrailLine<T>[]>(() => toLines(trail));

  useEffect(() => {
    const next = toLines(trail);
    setLines((prev) => {
      const merged = [...next];
      prev.forEach((line, index) => {
        if (!line.leaving && !next.some((n) => n.heading.pos === line.heading.pos)) {
          merged.splice(Math.min(index, merged.length), 0, { ...line, leaving: true });
        }
      });
      return merged;
    });
    const timer = window.setTimeout(() => setLines(next), LEAVE_MS);
    return () => window.clearTimeout(timer);
    // 제목 위치가 같으면 다시 돌리지 않는다 (글자만 바뀐 것은 아래 효과에서 반영).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 제목 글자를 고친 경우: 줄은 그대로 두고 내용만 바꾼다.
  const fresh = new Map(trail.map((h) => [h.pos, h]));
  return lines.map((line) => ({ ...line, heading: fresh.get(line.heading.pos) ?? line.heading }));
}

function toLines<T>(trail: T[]): TrailLine<T>[] {
  return trail.map((heading, depth) => ({ heading, depth, last: depth === trail.length - 1, leaving: false }));
}

/** index번 제목과 그 위로 이어지는 상위 제목들 (위에서부터). 예: 들어가며(h1) → 영상에서 얻은 힌트(h2) → 제가 꽂힌 한 문장(h3) */
function headingTrail<T extends { level: number }>(headings: T[], index: number): T[] {
  const trail = [headings[index]!];
  for (let i = index - 1; i >= 0; i--) {
    if (headings[i]!.level < trail[0]!.level) trail.unshift(headings[i]!);
  }
  return trail;
}
