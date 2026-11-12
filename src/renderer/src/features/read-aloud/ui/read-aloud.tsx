import { AudioLines, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
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
      <AudioLines className={cn("size-4", active && "animate-pulse")} />
    </button>
  );
}

const iconButton = "flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40";

/** 읽는 동안 화면 아래에 뜨는 조작 막대: 앞·뒤 문장, 잠깐 멈춤, 속도, 그만 읽기 */
export function ReadAloudBar() {
  const { active, paused, index, total, selection, rate, controller, setRate } = useReadAloud();

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      useReadAloud.getState().controller?.stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
      <AudioLines className={cn("size-4 text-sky-600", !paused && "animate-pulse")} />
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
      <select
        aria-label="읽는 속도"
        title="읽는 속도 (다음 문장부터)"
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        className="h-7 rounded-full border-0 bg-transparent px-1.5 text-xs tabular-nums hover:bg-accent"
      >
        {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      <button type="button" aria-label="그만 읽기" title="그만 읽기 (Esc)" className={iconButton} onClick={() => controller.stop()}>
        <Square className="size-3.5" />
      </button>
    </div>,
    document.body,
  );
}
