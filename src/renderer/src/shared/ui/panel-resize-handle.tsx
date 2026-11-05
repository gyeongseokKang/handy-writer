import { useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";
import { ResizeGrip, WidthRuler } from "@/shared/ui/resize-grip";

const KEY_STEP = 16;

/**
 * 패널 가장자리 손잡이. 끌면 너비가 바뀌고, 두 번 누르면 기본 너비로 돌아간다.
 * edge: 손잡이가 붙는 쪽. 오른쪽 패널은 왼쪽 가장자리를 왼쪽으로 끌수록 넓어진다.
 */
export function PanelResizeHandle({
  edge, width, setWidth, min, max, fallback, label,
}: {
  edge: "left" | "right";
  width: number;
  /** persist가 false면 끄는 동안 화면에만 반영 */
  setWidth: (width: number, persist?: boolean) => void;
  min: number;
  max: number;
  fallback: number;
  label: string;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const sign = edge === "right" ? 1 : -1;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setDragging(true);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (start) setWidth(start.width + sign * (event.clientX - start.x), false);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setWidth(width);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : 0;
    if (!delta) return;
    event.preventDefault();
    setWidth(width + sign * delta);
  };

  // 끄는 동안 패널 위에 눈금자와 지금 너비를 띄운다.
  const panel = dragging ? ref.current?.parentElement?.getBoundingClientRect() : null;
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
      title={`끌어서 ${label.replace(/ 조절$/, "")} 조절 · 두 번 누르면 기본 너비`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setWidth(fallback)}
      onKeyDown={onKeyDown}
      className={cn(
        "group/panel-width absolute top-0 bottom-0 z-20 flex w-3 cursor-col-resize justify-center outline-none",
        edge === "right" ? "-right-1.5" : "-left-1.5",
      )}
    >
      <span
        className={cn(
          "w-0.5 bg-ring opacity-0 transition-opacity group-hover/panel-width:opacity-60 group-focus-visible/panel-width:opacity-100",
          dragging && "opacity-100",
        )}
      />
      <ResizeGrip active={dragging} className="group-hover/panel-width:opacity-100 group-focus-visible/panel-width:opacity-100" />
      {panel && <WidthRuler rect={{ left: panel.left, top: panel.top, width: panel.width }} width={panel.width} anchor={edge === "right" ? "left" : "right"} />}
    </div>
  );
}
