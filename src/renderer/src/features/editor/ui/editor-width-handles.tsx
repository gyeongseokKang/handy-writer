import { useRef, useState } from "react";

import { DEFAULT_EDITOR_WIDTH, MAX_EDITOR_WIDTH, MIN_EDITOR_WIDTH, useUiStore } from "@/entities/note/model/use-ui-store";
import { cn } from "@/shared/lib/utils";

const KEY_STEP = 32;

/**
 * 글 칸 양옆의 너비 손잡이. 글 칸은 가운데 정렬이라 한쪽을 끌면 반대쪽도 같이 움직이도록
 * 끈 거리의 두 배만큼 너비를 바꾼다. 두 번 누르면 기본 너비로 돌아간다.
 */
export function EditorWidthHandles({ columnRef }: { columnRef: React.RefObject<HTMLDivElement | null> }) {
  const editorWidth = useUiStore((s) => s.editorWidth);
  const setEditorWidth = useUiStore((s) => s.setEditorWidth);
  const drag = useRef<{ x: number; width: number; side: 1 | -1 } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (side: 1 | -1) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    // 창이 좁아 실제로는 덜 넓게 보이고 있으면 보이는 너비부터 늘린다.
    drag.current = { x: event.clientX, width: columnRef.current?.getBoundingClientRect().width ?? editorWidth, side };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setEditorWidth(start.width + (event.clientX - start.x) * 2 * start.side);
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (side: 1 | -1) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : 0;
    if (!delta) return;
    event.preventDefault();
    setEditorWidth(editorWidth + delta * 2 * side);
  };

  return (
    <>
      {([-1, 1] as const).map((side) => (
        <div
          key={side}
          role="separator"
          aria-orientation="vertical"
          aria-label={side === -1 ? "글 너비 조절 (왼쪽)" : "글 너비 조절 (오른쪽)"}
          aria-valuemin={MIN_EDITOR_WIDTH}
          aria-valuemax={MAX_EDITOR_WIDTH}
          aria-valuenow={editorWidth}
          tabIndex={0}
          title="끌어서 글 너비 조절 · 두 번 누르면 기본 너비"
          onPointerDown={onPointerDown(side)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setEditorWidth(DEFAULT_EDITOR_WIDTH)}
          onKeyDown={onKeyDown(side)}
          className={cn(
            "group/width absolute top-0 bottom-0 z-10 flex w-3 cursor-col-resize justify-center outline-none",
            side === -1 ? "-left-1.5" : "-right-1.5",
          )}
        >
          <span
            className={cn(
              "w-0.5 rounded-full bg-border opacity-0 transition-opacity group-hover/width:opacity-100 group-focus-visible/width:opacity-100",
              dragging && "opacity-100 bg-ring",
            )}
          />
        </div>
      ))}
    </>
  );
}
