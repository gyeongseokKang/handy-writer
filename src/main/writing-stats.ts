import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { countChars, dateKey, writtenToday, type TodayFiles, type WritingDays, type WritingStats } from "../shared/writing-stats";

interface RootStats {
  days: WritingDays;
  today: TodayFiles;
}

interface StatsFile {
  version: 1;
  roots: Record<string, RootStats>;
}

/** 이만큼 지난 날의 기록은 버린다 (잔디 달력은 1년치만 보여 준다). */
const KEEP_DAYS = 400;
const SAVE_DELAY_MS = 2000;

/**
 * 작업 폴더마다 하루에 쓴 글자 수를 이 컴퓨터에 기록한다 (git에 올리지 않는다).
 * 저장할 때마다 글의 하루 시작 분량과 지금 분량을 견줘서, 자동 저장이 잦아도 두 번 세지 않는다.
 */
export class WritingStatsStore {
  private data: StatsFile | null = null;
  private loading: Promise<StatsFile> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async load(): Promise<StatsFile> {
    if (this.data) return this.data;
    this.loading ??= readFile(this.file, "utf8")
      .then((text) => {
        const value = JSON.parse(text) as StatsFile;
        return value?.version === 1 && value.roots && typeof value.roots === "object" ? value : { version: 1 as const, roots: {} };
      })
      .catch(() => ({ version: 1 as const, roots: {} }));
    this.data = await this.loading;
    return this.data;
  }

  /** 날짜가 바뀌었으면 어제까지의 기록을 접고 오늘을 새로 시작한다. */
  private roll(stats: RootStats, today: string) {
    if (stats.today.date !== today) {
      if (stats.today.date) stats.days[stats.today.date] = writtenToday(stats.today);
      stats.today = { date: today, files: {} };
      const oldest = dateKey(new Date(this.now().getTime() - KEEP_DAYS * 86_400_000));
      for (const day of Object.keys(stats.days)) if (day < oldest || stats.days[day] === 0) delete stats.days[day];
    }
  }

  private rootStats(data: StatsFile, root: string) {
    const stats = (data.roots[root] ??= { days: {}, today: { date: "", files: {} } });
    this.roll(stats, dateKey(this.now()));
    return stats;
  }

  /**
   * 글을 저장할 때 부른다. before는 저장 전 파일 내용(새 글이면 null).
   * counted가 false면(가져온 글, 되돌린 버전) 그만큼 하루 시작 분량도 옮겨서 쓴 양에 넣지 않는다.
   */
  async record(root: string, path: string, before: string | null, after: string, counted = true) {
    const data = await this.load();
    const stats = this.rootStats(data, root);
    const file = (stats.today.files[path] ??= { base: before === null ? 0 : countChars(before), now: before === null ? 0 : countChars(before) });
    const next = countChars(after);
    if (!counted) file.base += next - file.now;
    file.now = next;
    stats.days[stats.today.date] = writtenToday(stats.today);
    this.scheduleSave();
    return stats.days[stats.today.date] ?? 0;
  }

  async get(root: string): Promise<WritingStats> {
    const data = await this.load();
    const stats = this.rootStats(data, root);
    return { today: stats.today.date, days: { ...stats.days, [stats.today.date]: writtenToday(stats.today) } };
  }

  private scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, SAVE_DELAY_MS);
  }

  /** 앱을 끄기 전이나 테스트에서 바로 파일에 쓴다. */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.data) return;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.data), "utf8");
  }
}
