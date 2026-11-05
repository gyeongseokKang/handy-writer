import { MoveHorizontal } from "lucide-react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";

/**
 * 너비 손잡이 가운데의 ↔ 표시. 평소에도 흐리게 보여서 끌 수 있는 곳임을 알리고, 올리거나 끄는 동안 또렷해진다.
 * sticky면 아주 긴 칸(글 칸)에서도 화면 가운데쯤에 머문다.
 */
export function ResizeGrip({ active, sticky, className }: { active?: boolean; sticky?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none z-10 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-opacity",
        sticky ? "sticky top-[45vh]" : "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        active ? "border-ring text-foreground opacity-100" : "opacity-40",
        className,
      )}
    >
      <MoveHorizontal className="size-3" />
    </span>
  );
}

const MINOR = 10;
const MAJOR = 50;
const LABEL = 100;

/**
 * Word처럼 칸 위에 눈금자를 띄우고 지금 너비(px)를 흐리게 보여 준다. 끄는 동안에만 그린다.
 * rect는 화면 기준 칸의 위치. 눈금은 칸 왼쪽(anchor가 right면 오른쪽)에서부터 센다.
 */
export function WidthRuler({ rect, width, anchor = "left" }: { rect: { left: number; top: number; width: number }; width: number; anchor?: "left" | "right" }) {
  const labels = Array.from({ length: Math.floor(rect.width / LABEL) }, (_, i) => (i + 1) * LABEL);
  const direction = anchor === "left" ? "to right" : "to left";
  return createPortal(
    <div
      aria-hidden
      data-testid="width-ruler"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        backgroundImage: [
          `repeating-linear-gradient(${direction}, currentColor 0 1px, transparent 1px ${MAJOR}px)`,
          `repeating-linear-gradient(${direction}, currentColor 0 1px, transparent 1px ${MINOR}px)`,
        ].join(","),
        backgroundSize: "100% 10px, 100% 5px",
        backgroundPosition: "0 100%, 0 100%",
        backgroundRepeat: "no-repeat",
      }}
      className="pointer-events-none fixed z-[60] h-6 border-b border-foreground/20 bg-background/85 text-foreground/35 backdrop-blur-sm"
    >
      {labels.map((n) => (
        <span key={n} style={anchor === "left" ? { left: n + 2 } : { right: n + 2 }} className="absolute top-0.5 text-[9px] leading-none text-muted-foreground/70 tabular-nums">{n}</span>
      ))}
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground/75 px-1.5 py-px text-[11px] font-medium text-background tabular-nums">
        {Math.round(width)}px
      </span>
    </div>,
    document.body,
  );
}
