import { useRef, useState } from "react";

import { DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, useUiStore } from "@/entities/note/model/use-ui-store";
import { cn } from "@/shared/lib/utils";

const KEY_STEP = 16;

/** 사이드바 오른쪽 가장자리 손잡이. 끌면 너비가 바뀌고, 두 번 누르면 기본 너비로 돌아간다. */
export function SidebarResizeHandle() {
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: sidebarWidth };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start) setSidebarWidth(start.width + event.clientX - start.x, false);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setSidebarWidth(useUiStore.getState().sidebarWidth);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : 0;
    if (!delta) return;
    event.preventDefault();
    setSidebarWidth(sidebarWidth + delta);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="사이드바 너비 조절"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={sidebarWidth}
      tabIndex={0}
      title="끌어서 사이드바 너비 조절 · 두 번 누르면 기본 너비"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
      onKeyDown={onKeyDown}
      className="group/sidebar-width absolute top-0 -right-1.5 bottom-0 z-20 flex w-3 cursor-col-resize justify-center outline-none"
    >
      <span
        className={cn(
          "w-0.5 bg-ring opacity-0 transition-opacity group-hover/sidebar-width:opacity-60 group-focus-visible/sidebar-width:opacity-100",
          dragging && "opacity-100",
        )}
      />
    </div>
  );
}
