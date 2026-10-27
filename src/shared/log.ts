/** 앱 안에서 생긴 오류·경고를 한곳에 모아 상태 막대의 로그 창에서 보여준다. */

export type LogLevel = "error" | "warning";

export interface LogEntry {
  id: number;
  /** 생긴 시각 (ms) */
  time: number;
  level: LogLevel;
  /** 어디서 생겼는지 (AI, 업데이트, 화면 등) */
  source: string;
  message: string;
}

export type LogInput = Pick<LogEntry, "level" | "source" | "message">;

const MAX_ENTRIES = 300;
const MAX_MESSAGE_CHARS = 4000;

/**
 * 최근 기록만 남기는 로그 목록. 바로 이어서 같은 메시지가 오면 한 번만 남긴다
 * (메인이 남긴 오류를 화면이 알림으로 띄우며 다시 보내는 경우도 여기서 걸러진다).
 */
export function createLogBook(now: () => number = Date.now) {
  let entries: LogEntry[] = [];
  let nextId = 1;
  return {
    add(input: LogInput): LogEntry | null {
      const message = input.message.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!message) return null;
      const last = entries.at(-1);
      if (last && last.message === message && now() - last.time < 2000) return null;
      const entry: LogEntry = { id: nextId++, time: now(), level: input.level, source: input.source.slice(0, 40), message };
      entries = [...entries, entry].slice(-MAX_ENTRIES);
      return entry;
    },
    list: () => entries,
    clear() {
      entries = [];
    },
  };
}

/** 로그 파일과 복사용 한 줄 */
export function formatLogLine(entry: LogEntry) {
  const level = entry.level === "error" ? "ERROR" : "WARN";
  return `${new Date(entry.time).toISOString()} [${level}] [${entry.source}] ${entry.message.replace(/\n/g, "\n    ")}`;
}

/** 렌더러에서 온 값을 믿지 않고 모양을 맞춘다. */
export function parseLogInput(value: unknown): LogInput | null {
  const v = value as Partial<LogInput> | null;
  if (!v || typeof v.message !== "string") return null;
  return {
    level: v.level === "warning" ? "warning" : "error",
    source: typeof v.source === "string" && v.source.trim() ? v.source.trim() : "화면",
    message: v.message,
  };
}
