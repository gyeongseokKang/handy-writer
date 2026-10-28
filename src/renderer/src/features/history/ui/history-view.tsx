import { ChevronLeft, ChevronRight, GitBranch, History, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { api } from "@/shared/api/handy-api";
import { flushPath } from "@/shared/lib/pending-saves";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { splitFrontmatter } from "@shared/frontmatter";

import { diffVersions, isGap, type DiffLine } from "../lib/history-diff";
import { useHistoryStore, type HistorySlide } from "../model/use-history-store";

/** 자동 재생할 때 한 장에 머무는 시간 */
const PLAY_INTERVAL_MS = 1400;
/** 지금 장 양옆으로 그려 둘 장 수 */
const VISIBLE_NEIGHBORS = 2;
/** 변경 표시 애니메이션을 차례로 띄울 때 최대 지연 단계 */
const MAX_STAGGER = 24;

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const relativeFormat = new Intl.RelativeTimeFormat("ko-KR", { numeric: "auto" });

function relativeTime(time: number) {
  const minutes = Math.round((time - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relativeFormat.format(days, "day");
  return relativeFormat.format(Math.round(days / 30), "month");
}

const body = (raw: string | undefined) => (raw === undefined ? undefined : splitFrontmatter(raw).body);

function lineTone(line: DiffLine) {
  const types = new Set(line.segments.filter((s) => s.text.trim()).map((s) => s.type));
  if (types.has("added") && types.has("removed")) return "mixed";
  if (types.has("added")) return "added";
  if (types.has("removed")) return "removed";
  return "same";
}

function DiffBody({ before, after, collapse, active }: { before: string; after: string; collapse: boolean; active: boolean }) {
  const diff = useMemo(() => diffVersions(before, after, collapse), [before, after, collapse]);
  const ref = useRef<HTMLDivElement>(null);

  // 이 장이 가운데로 오면 첫 변경으로 스크롤한다.
  useLayoutEffect(() => {
    if (!active) return;
    const first = ref.current?.querySelector<HTMLElement>("[data-changed='true']");
    const scroller = ref.current?.parentElement;
    if (first && scroller) scroller.scrollTo({ top: Math.max(0, first.offsetTop - scroller.clientHeight / 3) });
    else scroller?.scrollTo({ top: 0 });
  }, [active, diff]);

  let change = 0;
  const changedLines = diff.rows.filter((row) => !isGap(row) && row.changed).length;

  return (
    <div ref={ref} className="history-diff">
      {changedLines === 0 && <p className="py-6 text-center text-sm text-muted-foreground">본문은 그대로예요 (글 머리 정보나 공백만 바뀌었어요).</p>}
      {diff.rows.map((row, index) => {
        if (isGap(row)) {
          return (
            <div key={`gap-${index}`} className="history-gap">
              ⋯ {row.gap}줄 같음
            </div>
          );
        }
        return (
          <div key={index} data-changed={row.changed} data-tone={lineTone(row)} className="history-line">
            {row.segments.length === 0
              ? " "
              : row.segments.map((segment, i) => {
                  if (segment.type === "same") return <span key={i}>{segment.text}</span>;
                  const style = { "--i": Math.min(change++, MAX_STAGGER) } as React.CSSProperties;
                  return segment.type === "added" ? (
                    <ins key={i} style={style}>
                      {segment.text}
                    </ins>
                  ) : (
                    <del key={i} style={style}>
                      {segment.text}
                    </del>
                  );
                })}
          </div>
        );
      })}
    </div>
  );
}

function SlideCard({ slide, previous, offset, collapse, onSelect }: { slide: HistorySlide; previous: HistorySlide | undefined; offset: number; collapse: boolean; onSelect: () => void }) {
  const after = useHistoryStore((s) => body(s.contents[slide.key]));
  const before = useHistoryStore((s) => (previous ? body(s.contents[previous.key]) : ""));
  const stats = useMemo(() => (after !== undefined && before !== undefined ? diffVersions(before, after, false) : null), [before, after]);
  const active = offset === 0;

  return (
    <article
      aria-label={`${dateFormat.format(slide.time)} 버전`}
      aria-current={active ? "true" : undefined}
      onClick={active ? undefined : onSelect}
      className={cn("history-card", active && "is-active")}
      style={{ "--offset": offset, "--dist": Math.min(Math.abs(offset), 2) } as React.CSSProperties}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-5 py-3">
        <span className="font-semibold tabular-nums">{slide.hash ? dateFormat.format(slide.time) : "지금"}</span>
        <span className="text-xs text-muted-foreground">{slide.hash ? relativeTime(slide.time) : "커밋 전"}</span>
        {stats && (
          <span className="ml-auto flex gap-2 text-xs font-medium tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{stats.added.toLocaleString("ko-KR")}자</span>
            <span className="text-red-600 dark:text-red-400">−{stats.removed.toLocaleString("ko-KR")}자</span>
          </span>
        )}
        <p className="w-full truncate text-sm text-muted-foreground">
          {slide.subject}
          {slide.author && <span> · {slide.author}</span>}
          {slide.hash && <span className="font-mono text-xs"> · {slide.hash.slice(0, 7)}</span>}
          {!previous && <span> · 처음 버전</span>}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {after === undefined || before === undefined ? (
          <p className="flex items-center justify-center gap-1.5 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </p>
        ) : (
          <DiffBody before={before} after={after} collapse={collapse} active={active} />
        )}
      </div>
    </article>
  );
}

function Timeline({ slides, index, onSelect }: { slides: HistorySlide[]; index: number; onSelect: (index: number) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-current='step']")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);
  return (
    <ol ref={ref} aria-label="버전 목록" className="history-timeline">
      {slides.map((slide, i) => (
        <li key={slide.key}>
          <button
            type="button"
            aria-label={slide.hash ? `${dateFormat.format(slide.time)} ${slide.subject}` : "지금 내용"}
            aria-current={i === index ? "step" : undefined}
            title={slide.hash ? `${dateFormat.format(slide.time)}\n${slide.subject}` : "지금 (커밋 전)"}
            onClick={() => onSelect(i)}
            className={cn("history-dot", i < index && "is-past", !slide.hash && "is-current")}
          />
        </li>
      ))}
    </ol>
  );
}

function Empty({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}

/** 글 한 편의 변경 기록. 버전을 카드로 늘어놓고 ←/→로 넘기며, 추가는 초록·삭제는 빨강으로 보여준다. */
export function HistoryView({ path: targetPath, name: targetName }: { path: string; name: string }) {
  const { path, name, status, error, slides, index } = useHistoryStore();
  const { go } = useHistoryStore.getState();
  const close = () => useUiStore.getState().setHistoryTarget(null);

  useEffect(() => {
    void useHistoryStore.getState().open(targetPath, targetName);
    return () => useHistoryStore.getState().close();
  }, [targetPath, targetName]);
  const [collapse, setCollapse] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  const move = (step: number) => {
    setDirection(step < 0 ? -1 : 1);
    go(useHistoryStore.getState().index + step);
  };
  const jump = (target: number) => {
    setDirection(target < useHistoryStore.getState().index ? -1 : 1);
    go(target);
  };

  // 자동 재생: 지금 장부터 최신까지 한 장씩 넘긴다. 처음부터 보려면 Home을 누른 뒤 재생한다.
  useEffect(() => {
    if (!playing) return;
    if (index >= slides.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => move(1), PLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, slides.length]);

  const togglePlay = () => {
    if (!playing && index >= slides.length - 1) jump(0);
    setPlaying((v) => !v);
  };

  const keyRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyRef.current = (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select")) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => (setPlaying(false), move(-1)),
      ArrowRight: () => (setPlaying(false), move(1)),
      Home: () => (setPlaying(false), jump(0)),
      End: () => (setPlaying(false), jump(slides.length - 1)),
      " ": togglePlay,
      Escape: close,
      f: () => setCollapse((v) => !v),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyRef.current(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const slide = slides[index];
  const restore = async () => {
    if (!path || !slide?.hash) return;
    const content = useHistoryStore.getState().contents[slide.key];
    if (content === undefined) return;
    if (!window.confirm(`“${name}” 글을 ${dateFormat.format(slide.time)} 버전으로 되돌릴까요?\n지금 내용은 git에 커밋되어 있지 않으면 사라져요.`)) return;
    try {
      await flushPath(path);
      await api.notes.write(path, content);
      toast.success(`${dateFormat.format(slide.time)} 버전으로 되돌렸어요.`);
      close();
    } catch (err) {
      toast.error(`되돌리지 못했어요: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const hasLaterVersions = slide?.hash && index < slides.length - 1;

  return (
    <div role="dialog" aria-modal="true" aria-label="변경 기록" className="history-view fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <header className="flex items-center gap-3 border-b px-5 py-2.5">
        <History className="size-4 text-muted-foreground" />
        <h2 className="min-w-0 truncate font-semibold">
          변경 기록 <span className="font-normal text-muted-foreground">· {name}</span>
        </h2>
        {status === "ready" && (
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {index + 1} / {slides.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {status === "ready" && (
            <>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
                바뀐 부분만
              </label>
              <Button size="sm" variant="ghost" aria-label={playing ? "멈춤" : "재생"} title="Space" onClick={togglePlay} disabled={slides.length < 2}>
                {playing ? <Pause /> : <Play />} {playing ? "멈춤" : "재생"}
              </Button>
            </>
          )}
          <button type="button" aria-label="기록 닫기" title="닫기 (Esc)" onClick={close} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
      </header>

      {status === "loading" && <Empty icon={<Loader2 className="animate-spin" />} title="기록을 불러오는 중…" detail="git에서 이 글의 커밋을 읽고 있어요." />}
      {status === "error" && <Empty icon={<History />} title="기록을 읽지 못했어요" detail={error} />}
      {status === "unavailable" && (
        <Empty
          icon={<GitBranch />}
          title="작업 폴더가 git 저장소가 아니에요"
          detail="Git 화면에서 저장소를 만들고 커밋하면, 커밋할 때마다 이 글의 버전이 남아서 여기서 볼 수 있어요. 자동 커밋을 켜 두면 편해요."
          action={
            <Button size="sm" variant="outline" onClick={() => (close(), useUiStore.getState().toggleGit())}>
              Git 화면 열기
            </Button>
          }
        />
      )}
      {status === "ready" && slides.length === 1 && !slides[0]?.hash && (
        <Empty icon={<History />} title="아직 이 글을 커밋한 적이 없어요" detail="Git 화면에서 커밋하거나 자동 커밋을 켜 두면 버전이 쌓여요. 지금은 처음 버전만 있어요." />
      )}

      {status === "ready" && !(slides.length === 1 && !slides[0]?.hash) && (
        <>
          <div className="history-stage" data-direction={direction}>
            <button type="button" aria-label="이전 버전" disabled={index === 0} onClick={() => (setPlaying(false), move(-1))} className="history-nav left-4">
              <ChevronLeft className="size-5" />
            </button>
            {slides.map((s, i) => {
              const offset = i - index;
              if (Math.abs(offset) > VISIBLE_NEIGHBORS) return null;
              return <SlideCard key={s.key} slide={s} previous={slides[i - 1]} offset={offset} collapse={collapse} onSelect={() => (setPlaying(false), jump(i))} />;
            })}
            <button type="button" aria-label="다음 버전" disabled={index === slides.length - 1} onClick={() => (setPlaying(false), move(1))} className="history-nav right-4">
              <ChevronRight className="size-5" />
            </button>
          </div>
          <footer className="flex flex-col gap-2 border-t px-5 py-3">
            <Timeline slides={slides} index={index} onSelect={(i) => (setPlaying(false), jump(i))} />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                <kbd>←</kbd> <kbd>→</kbd> 넘기기 · <kbd>Home</kbd> <kbd>End</kbd> 처음·끝 · <kbd>Space</kbd> 재생 · <kbd>F</kbd> 전체 보기 · <kbd>Esc</kbd> 닫기
              </span>
              <span className="ml-auto flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="history-legend added" /> 추가</span>
                <span className="flex items-center gap-1"><span className="history-legend removed" /> 삭제</span>
                {hasLaterVersions && (
                  <Button size="sm" variant="outline" onClick={() => void restore()}>
                    <RotateCcw /> 이 버전으로 되돌리기
                  </Button>
                )}
              </span>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
