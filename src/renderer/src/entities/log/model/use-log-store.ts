import type { LogEntry } from "@shared/log";
import { toast } from "sonner";
import { create } from "zustand";

import { api } from "@/shared/api/handy-api";

interface LogState {
  /** 오래된 것부터 */
  entries: LogEntry[];
  open: boolean;
  /** 로그 창을 마지막으로 열었을 때 본 마지막 기록 */
  seenId: number;
  setOpen: (open: boolean) => void;
  clear: () => Promise<void>;
}

const lastId = (entries: LogEntry[]) => entries.at(-1)?.id ?? 0;

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  open: false,
  seenId: 0,
  setOpen: (open) => set({ open, ...(open ? { seenId: lastId(get().entries) } : {}) }),
  clear: async () => {
    await api.log.clear();
    set({ entries: [], seenId: 0 });
  },
}));

/** 아직 보지 않은 오류 수 */
export const selectUnread = (s: LogState) => s.entries.filter((e) => e.id > s.seenId && e.level === "error").length;

function receive(entry: LogEntry) {
  useLogStore.setState((s) => {
    if (s.entries.some((e) => e.id === entry.id)) return s;
    const entries = [...s.entries, entry].slice(-300);
    return { entries, ...(s.open ? { seenId: entry.id } : {}) };
  });
}

const report = (level: "error" | "warning", source: string, message: unknown) => {
  if (typeof message === "string" && message.trim()) void api.log.add({ level, source, message }).catch(() => {});
};

/**
 * 메인이 남긴 기록을 받고, 화면에서 생긴 오류도 모은다.
 * 화면의 오류는 대부분 알림(toast.error)으로 뜨므로 알림을 띄울 때 함께 남긴다.
 */
export function startLogSync() {
  void api.log.list().then((entries) => useLogStore.setState({ entries }));
  const stop = api.log.onEntry(receive);

  const { error, warning } = toast;
  toast.error = (message, data) => {
    report("error", "화면", message);
    return error(message, data);
  };
  toast.warning = (message, data) => {
    report("warning", "화면", message);
    return warning(message, data);
  };

  const onError = (event: ErrorEvent) => report("error", "화면", event.error instanceof Error ? (event.error.stack ?? event.message) : event.message);
  const onRejection = (event: PromiseRejectionEvent) =>
    report("error", "화면", event.reason instanceof Error ? (event.reason.stack ?? event.reason.message) : String(event.reason));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    stop();
    toast.error = error;
    toast.warning = warning;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
