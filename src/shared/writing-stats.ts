import { splitFrontmatter } from "./frontmatter";

/** 날짜(이 컴퓨터 시간 기준 `YYYY-MM-DD`) → 그날 쓴 글자 수 */
export type WritingDays = Record<string, number>;

export interface WritingStats {
  today: string;
  days: WritingDays;
}

/** 이 컴퓨터 시간대의 날짜 키 */
export function dateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(key: string, delta: number) {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + delta));
}

/** 글의 분량: frontmatter를 뺀 본문의 글자 수 (줄바꿈 제외, 공백 포함) */
export function countChars(raw: string) {
  return [...splitFrontmatter(raw).body.replace(/[\r\n]+/g, "")].length;
}

/**
 * 연속으로 쓴 날 수. 오늘 아직 안 썼으면 어제까지 이어진 날을 센다.
 */
export function writingStreak(days: WritingDays, today: string) {
  let day = (days[today] ?? 0) > 0 ? today : addDays(today, -1);
  let streak = 0;
  while ((days[day] ?? 0) > 0) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** 오늘 각 글이 처음 저장되기 전 분량(base)과 지금 분량(now) */
export interface TodayFiles {
  date: string;
  files: Record<string, { base: number; now: number }>;
}

/** 오늘 쓴 양: 글마다 하루 시작 때보다 늘어난 만큼을 더한다 (줄인 글은 0). */
export function writtenToday(today: TodayFiles) {
  return Object.values(today.files).reduce((sum, file) => sum + Math.max(0, file.now - file.base), 0);
}
