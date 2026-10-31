import { Flame } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { addDays, dateKey, writingStreak, type WritingStats } from "@shared/writing-stats";

const GOAL_KEY = "handy-writer:daily-goal";
/** 잔디 달력에 보여 줄 주 수 */
const WEEKS = 18;
const formatNumber = (n: number) => n.toLocaleString("ko-KR");

function readGoal() {
  try {
    const value = Number(localStorage.getItem(GOAL_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveGoal(goal: number | null) {
  try {
    if (goal) localStorage.setItem(GOAL_KEY, String(goal));
    else localStorage.removeItem(GOAL_KEY);
  } catch {
    // 저장소를 못 써도 이번에는 바뀐 대로 보여 준다.
  }
}

/** 날마다 쓴 양을 받아 오고, 저장할 때마다 오늘 숫자를 고친다. */
function useWritingStats() {
  const root = useWorkspaceStore((s) => s.root);
  const [stats, setStats] = useState<WritingStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api.writingStats.get().then(
        (next) => alive && setStats(next),
        () => {},
      );
    if (root) void load();
    const off = api.writingStats.onChange((today) =>
      setStats((current) => {
        // 자정을 넘겼으면 날짜부터 다시 받아 온다.
        if (!current || current.today !== dateKey(new Date())) {
          void load();
          return current;
        }
        return { ...current, days: { ...current.days, [current.today]: today } };
      }),
    );
    return () => {
      alive = false;
      off();
    };
  }, [root]);
  return stats;
}

/** 잔디 달력: 오늘이 든 주까지 WEEKS주, 위에서 아래로 일~토 */
function Heatmap({ stats, goal }: { stats: WritingStats; goal: number | null }) {
  const cells = useMemo(() => {
    const [y = 0, m = 1, d = 1] = stats.today.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const start = addDays(stats.today, -(WEEKS - 1) * 7 - weekday);
    return Array.from({ length: WEEKS * 7 }, (_v, i) => addDays(start, i));
  }, [stats.today]);
  const max = Math.max(goal ?? 0, ...cells.map((day) => stats.days[day] ?? 0), 1);
  const level = (n: number) => (n <= 0 ? 0 : n >= max ? 4 : Math.min(4, 1 + Math.floor((n / max) * 4)));
  return (
    <div role="img" aria-label={`최근 ${WEEKS}주 동안 날마다 쓴 양`} className="grid grid-flow-col grid-rows-7 gap-[3px]">
      {cells.map((day) => {
        const n = stats.days[day] ?? 0;
        const future = day > stats.today;
        return (
          <span
            key={day}
            title={future ? undefined : `${day}: ${formatNumber(n)}자`}
            className={cn(
              "size-2.5 rounded-[2px]",
              future ? "bg-transparent" : ["bg-border/70", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600", "bg-emerald-800"][level(n)],
              day === stats.today && "ring-1 ring-foreground/40",
            )}
          />
        );
      })}
    </div>
  );
}

/** 아래 막대의 `오늘 +1,240자`. 누르면 연속 기록, 하루 목표, 잔디 달력을 보여 준다. */
export function WritingToday() {
  const stats = useWritingStats();
  const open = useUiStore((s) => s.statsOpen);
  const setOpen = useUiStore((s) => s.setStatsOpen);
  const [goal, setGoal] = useState(readGoal);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, setOpen]);

  if (!stats) return null;
  const today = stats.days[stats.today] ?? 0;
  const streak = writingStreak(stats.days, stats.today);
  const reached = goal !== null && today >= goal;
  const week = Array.from({ length: 7 }, (_v, i) => stats.days[addDays(stats.today, -i)] ?? 0).reduce((a, b) => a + b, 0);
  const activeDays = Array.from({ length: 30 }, (_v, i) => stats.days[addDays(stats.today, -i)] ?? 0).filter((n) => n > 0);
  const average = activeDays.length ? Math.round(activeDays.reduce((a, b) => a + b, 0) / activeDays.length) : 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="오늘 쓴 양"
        aria-expanded={open}
        title="오늘 쓴 글자 수 (모든 글, 저장할 때 셈)"
        onClick={() => setOpen(!open)}
        className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums hover:bg-accent", open && "bg-accent", reached && "text-emerald-600 dark:text-emerald-400")}
      >
        {streak > 1 && <Flame className="size-3" />}
        오늘 {goal ? `${formatNumber(today)}/${formatNumber(goal)}자` : `+${formatNumber(today)}자`}
      </button>
      {open && (
        <div role="dialog" aria-label="오늘 쓴 양" className="absolute bottom-full left-0 z-40 mb-2 w-[19rem] space-y-3 rounded-lg border bg-card p-3 text-sm whitespace-normal text-foreground shadow-lg">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xl font-semibold tabular-nums">+{formatNumber(today)}자</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Flame className={cn("size-3.5", streak > 0 && "text-orange-500")} />
              {streak > 0 ? `${streak}일 연속` : "오늘 시작해 보세요"}
            </span>
          </div>
          {goal !== null && (
            <div className="flex items-center gap-2">
              <div role="progressbar" aria-label="하루 목표 진행률" aria-valuenow={Math.round((today / goal) * 100)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div className={cn("h-full rounded-full bg-primary", reached && "bg-emerald-500")} style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.round((today / goal) * 100)}%</span>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            하루 목표
            <input
              aria-label="하루 목표"
              inputMode="numeric"
              placeholder="없음"
              defaultValue={goal ?? ""}
              onBlur={(event) => {
                const value = Number(event.target.value.replace(/[,\s]/g, ""));
                const next = Number.isFinite(value) && value > 0 ? Math.round(value) : null;
                saveGoal(next);
                setGoal(next);
              }}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="w-20 rounded border bg-background px-1.5 py-0.5 text-right text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            자
          </label>
          <Heatmap stats={stats} goal={goal} />
          <dl className="grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
            <dt>최근 7일</dt>
            <dd className="text-right text-foreground tabular-nums">{formatNumber(week)}자</dd>
            <dt>쓴 날 하루 평균 (30일)</dt>
            <dd className="text-right text-foreground tabular-nums">{formatNumber(average)}자</dd>
          </dl>
          <p className="text-[11px] text-muted-foreground">이 앱에서 저장한 글마다 그날 처음보다 늘어난 글자 수를 더해요. 이 컴퓨터에만 기록돼요.</p>
        </div>
      )}
    </div>
  );
}
