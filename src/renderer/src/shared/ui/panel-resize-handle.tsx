import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { shortcutLabel } from "@/shared/lib/shortcut";
import { cn } from "@/shared/lib/utils";

const KEY_STEP = 16;
/** 이만큼 움직이기 전까지는 '누르기'로 본다 */
const DRAG_THRESHOLD = 3;
const HINT_DELAY_MS = 350;

/**
 * 패널 가장자리 손잡이. 끌면 너비가 바뀌고, 그냥 누르면 패널을 접는다(onCollapse가 있을 때).
 * 올려 두면 커서 옆에 "닫기 · 크기 조정" 안내가 뜬다. 아이콘 없이 올렸을 때 약간 두꺼운 선만 드러난다.
 * edge: 손잡이가 붙는 쪽. 오른쪽 패널은 왼쪽 가장자리를 왼쪽으로 끌수록 넓어진다.
 */
export function PanelResizeHandle({
  edge, width, setWidth, min, max, fallback, label, onCollapse, collapseShortcut,
}: {
  edge: "left" | "right";
  width: number;
  /** persist가 false면 끄는 동안 화면에만 반영 */
  setWidth: (width: number, persist?: boolean) => void;
  min: number;
  max: number;
  fallback: number;
  label: string;
  /** 누르면 패널을 접는다 */
  onCollapse?: () => void;
  /** 접기 단축키 (안내에 보여 준다) */
  collapseShortcut?: string;
}) {
  const drag = useRef<{ x: number; width: number; moved: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<{ x: number; y: number } | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  const sign = edge === "right" ? 1 : -1;
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width, moved: false };
    window.clearTimeout(hintTimer.current);
    setHint(null);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) {
      // 올려 둔 채 움직이면 안내가 커서를 따라간다.
      const at = { x: event.clientX, y: event.clientY };
      if (hint) setHint(at);
      else {
        window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(at), HINT_DELAY_MS);
      }
      return;
    }
    if (!start.moved && Math.abs(event.clientX - start.x) < DRAG_THRESHOLD) return;
    if (!start.moved) {
      start.moved = true;
      setDragging(true);
    }
    setWidth(start.width + sign * (event.clientX - start.x), false);
  };
  const onPointerUp = () => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    setDragging(false);
    if (start.moved) setWidth(width);
    else onCollapse?.();
  };
  const onPointerLeave = () => {
    window.clearTimeout(hintTimer.current);
    setHint(null);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : 0;
    if (delta) {
      event.preventDefault();
      setWidth(width + sign * delta);
    } else if ((event.key === "Enter" || event.key === " ") && onCollapse) {
      event.preventDefault();
      onCollapse();
    }
  };

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onDoubleClick={() => !onCollapse && setWidth(fallback)}
      onKeyDown={onKeyDown}
      className={cn(
        "group/panel-width absolute top-0 bottom-0 z-20 flex w-3 cursor-col-resize justify-center outline-none",
        edge === "right" ? "-right-1.5" : "-left-1.5",
      )}
    >
      {/* 아이콘 없이, 올리면 약간 두꺼운 선이 드러난다 */}
      <span
        className={cn(
          "w-[3px] rounded-full bg-ring opacity-0 transition-opacity group-hover/panel-width:opacity-50 group-focus-visible/panel-width:opacity-80",
          dragging && "opacity-80",
        )}
      />
      {hint && !dragging && createPortal(
        <div
          role="tooltip"
          style={edge === "right" ? { left: hint.x + 14, top: hint.y + 14 } : { right: window.innerWidth - hint.x + 14, top: hint.y + 14 }}
          className="pointer-events-none fixed z-[60] space-y-0.5 rounded-lg bg-neutral-900/90 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg dark:bg-neutral-100/95 dark:text-neutral-900"
        >
          {onCollapse && (
            <p><span className="font-semibold">닫기</span> <span className="opacity-60">클릭{collapseShortcut ? `하거나 ${shortcutLabel(collapseShortcut)} 사용` : ""}</span></p>
          )}
          <p><span className="font-semibold">크기 조정</span> <span className="opacity-60">드래그</span></p>
        </div>,
        document.body,
      )}
    </div>
  );
}
