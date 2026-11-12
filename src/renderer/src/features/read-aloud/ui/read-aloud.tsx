import { AudioLines, Minus, Pause, Play, Plus, SkipBack, SkipForward, Square } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";

import { RATES, useReadAloud } from "../model/use-read-aloud";

/** 탭 막대의 소리 내어 읽기 버튼. 읽는 중이면 누르면 멈춘다. */
export function ReadAloudButton() {
  const active = useReadAloud((s) => s.active);
  const ready = useReadAloud((s) => s.controller !== null);
  return (
    <button
      type="button"
      aria-label="소리 내어 읽기"
      aria-pressed={active}
      disabled={!ready}
      title={active ? "읽기 멈추기 (Esc)" : "소리 내어 읽기 — 커서가 있는 문단부터 읽어요. 글을 선택하면 그 부분만. 들으면서 어색한 곳을 찾아요"}
      onClick={() => {
        const { controller } = useReadAloud.getState();
        if (active) controller?.stop();
        else controller?.start();
      }}
      className={cn(
        "flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-sky-500/10 hover:text-sky-600 disabled:opacity-40",
        active && "bg-sky-500/10 text-sky-600",
      )}
    >
      {active ? <SoundBars playing className="text-sky-600" /> : <AudioLines className="size-4" />}
    </button>
  );
}

/** 소리 막대: 읽는 동안 막대들이 서로 다른 박자로 오르내리고, 멈추면 낮게 멈춘다. */
export function SoundBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden data-playing={playing || undefined} className={cn("sound-bars", className)}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i} />)}
    </span>
  );
}

const iconButton = "flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";

/** 읽는 동안 화면 아래에 뜨는 조작 막대: 앞·뒤 문장, 잠깐 멈춤, 속도, 그만 읽기 */
export function ReadAloudBar() {
  const { active, paused, index, total, selection, rate, controller, setRate } = useReadAloud();

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      // 유튜브처럼 Shift + > 빠르게, Shift + < 느리게 (읽는 동안에는 글자 대신 속도를 바꾼다)
      const step = event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey ? (event.key === ">" || event.code === "Period" ? 1 : event.key === "<" || event.code === "Comma" ? -1 : 0) : 0;
      if (step) {
        event.preventDefault();
        event.stopPropagation();
        changeRate(step);
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      useReadAloud.getState().controller?.stop();
    };
    // 에디터가 글자를 넣기 전에 받는다.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active]);

  if (!active || !controller) return null;
  return createPortal(
    <div
      role="toolbar"
      aria-label="소리 내어 읽기"
      // 눌러도 에디터의 커서와 선택을 건드리지 않는다.
      onMouseDown={(event) => event.preventDefault()}
      className="fixed bottom-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card/95 py-1 pr-1.5 pl-3 text-card-foreground shadow-lg backdrop-blur"
    >
      <SoundBars playing={!paused} className="text-sky-600" />
      <span className="mr-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums" aria-label="읽는 문장">
        {paused ? "멈춤" : selection ? "선택 부분 읽는 중" : "읽는 중"} · {index + 1}/{total}
      </span>
      <button type="button" aria-label="앞 문장" title="앞 문장" className={iconButton} disabled={index === 0} onClick={() => controller.step(-1)}>
        <SkipBack className="size-3.5" />
      </button>
      <button type="button" aria-label={paused ? "이어 읽기" : "잠깐 멈추기"} title={paused ? "이어 읽기" : "잠깐 멈추기"} className={cn(iconButton, "size-8 bg-sky-500/10 text-sky-700 dark:text-sky-300")} onClick={() => (paused ? controller.resume() : controller.pause())}>
        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
      <button type="button" aria-label="다음 문장" title="다음 문장" className={iconButton} disabled={index >= total - 1} onClick={() => controller.step(1)}>
        <SkipForward className="size-3.5" />
      </button>
      <RateControl rate={rate} onChange={(next) => { setRate(next); controller.restart(); }} />
      <button type="button" aria-label="그만 읽기" title="그만 읽기 (Esc)" className={iconButton} onClick={() => controller.stop()}>
        <Square className="size-3.5" />
      </button>
    </div>,
    document.body,
  );
}

/** 속도를 한 단계 올리거나(1) 내린다(-1). 바꾸면 지금 문장부터 그 속도로 다시 읽는다. */
function changeRate(step: number) {
  const { rate, setRate, controller } = useReadAloud.getState();
  const at = Math.max(0, RATES.findIndex((r) => r === rate));
  const next = RATES[Math.min(RATES.length - 1, Math.max(0, at + step))]!;
  if (next === rate) return;
  setRate(next);
  controller?.restart();
}

/** 읽는 속도: −/+로 한 단계씩, 바꾸면 지금 문장부터 그 속도로 다시 읽는다. */
function RateControl({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  const at = Math.max(0, RATES.findIndex((r) => r === rate));
  return (
    <span role="group" aria-label="읽는 속도" className="flex items-center rounded-full bg-muted/60">
      <button type="button" aria-label="더 느리게" title="더 느리게 (Shift + <)" className={iconButton} disabled={at === 0} onClick={() => onChange(RATES[at - 1]!)}>
        <Minus className="size-3.5" />
      </button>
      <span aria-label="지금 속도" className="w-9 text-center text-xs tabular-nums">{rate}×</span>
      <button type="button" aria-label="더 빠르게" title="더 빠르게 (Shift + >)" className={iconButton} disabled={at === RATES.length - 1} onClick={() => onChange(RATES[at + 1]!)}>
        <Plus className="size-3.5" />
      </button>
    </span>
  );
}
