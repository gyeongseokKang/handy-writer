import { create } from "zustand";

import { api } from "@/shared/api/handy-api";
import { flushPath } from "@/shared/lib/pending-saves";

/** 기록 화면의 한 장. 왼쪽이 오래된 것, 오른쪽 끝이 최신(또는 아직 커밋하지 않은 지금 내용)이다. */
export interface HistorySlide {
  key: string;
  /** null이면 아직 커밋하지 않은 지금 내용 */
  hash: string | null;
  time: number;
  subject: string;
  author: string;
  blobPath: string;
}

type Status = "idle" | "loading" | "ready" | "unavailable" | "error";

interface HistoryState {
  path: string | null;
  name: string;
  status: Status;
  error: string;
  slides: HistorySlide[];
  index: number;
  /** slide.key → 그 버전의 파일 내용 (frontmatter 포함) */
  contents: Record<string, string>;

  open: (path: string, name: string) => Promise<void>;
  close: () => void;
  go: (index: number) => void;
}

/** 지금 보는 장과 양옆 몇 장의 내용만 미리 읽는다. */
const PREFETCH = 3;
const CURRENT_KEY = "current";
const inflight = new Map<string, Promise<void>>();

export const useHistoryStore = create<HistoryState>((set, get) => {
  const load = (slide: HistorySlide) => {
    if (get().contents[slide.key] !== undefined || !slide.hash) return Promise.resolve();
    const key = `${get().path}:${slide.key}`;
    let pending = inflight.get(key);
    if (!pending) {
      const path = get().path;
      pending = api.git
        .readVersion(slide.hash, slide.blobPath)
        .catch(() => "")
        .then((content) => {
          if (get().path === path) set((s) => ({ contents: { ...s.contents, [slide.key]: content } }));
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  };

  const prefetch = (index: number) => {
    const { slides } = get();
    for (let i = index - PREFETCH - 1; i <= index + PREFETCH; i++) {
      const slide = slides[i];
      if (slide) void load(slide);
    }
  };

  return {
    path: null,
    name: "",
    status: "idle",
    error: "",
    slides: [],
    index: 0,
    contents: {},

    open: async (path, name) => {
      set({ path, name, status: "loading", error: "", slides: [], index: 0, contents: {} });
      try {
        await flushPath(path);
        const [history, current] = await Promise.all([api.git.history(path), api.notes.read(path).catch(() => "")]);
        if (get().path !== path) return;
        if (!history.available) return set({ status: "unavailable" });

        const slides: HistorySlide[] = [...history.versions].reverse().map((v) => ({ key: v.hash, hash: v.hash, time: v.time, subject: v.subject, author: v.author, blobPath: v.blobPath }));
        const latest = slides.at(-1);
        if (latest) await load(latest);
        if (get().path !== path) return;
        // 마지막 커밋 뒤로 고친 내용이 있으면 맨 끝에 "지금" 장을 붙인다.
        if (!latest || get().contents[latest.key] !== current) {
          slides.push({ key: CURRENT_KEY, hash: null, time: Date.now(), subject: "아직 커밋하지 않은 지금 내용", author: "", blobPath: path });
          set((s) => ({ contents: { ...s.contents, [CURRENT_KEY]: current } }));
        }
        set({ slides, index: slides.length - 1, status: "ready" });
        prefetch(slides.length - 1);
      } catch (error) {
        if (get().path === path) set({ status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    },

    close: () => set({ path: null, status: "idle", slides: [], contents: {} }),

    go: (index) => {
      const { slides } = get();
      if (slides.length === 0) return;
      const next = Math.max(0, Math.min(slides.length - 1, index));
      set({ index: next });
      prefetch(next);
    },
  };
});
