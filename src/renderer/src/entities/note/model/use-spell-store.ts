import { create } from "zustand";

import type { SpellItem } from "@shared/spellcheck";

const ENABLED_KEY = "handy-writer:spellcheck";
const IGNORED_KEY = "handy-writer:spellcheck-ignored";
const ONLINE_KEY = "handy-writer:spellcheck-online";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 못 써도 앱은 동작해야 한다.
  }
}

export type OnlineSpellState = "unknown" | "ok" | "offline";

interface SpellState {
  enabled: boolean;
  /** 온라인 검사(다음·네이버)를 쓸지. 켜져 있으면 문단 내용이 그 서버로 전송된다. */
  online: boolean;
  onlineState: OnlineSpellState;
  /** 사용자가 "무시"한 항목의 키 (규칙:낱말) */
  ignored: string[];
  /** 지금 열린 글에서 표시 중인 맞춤법 항목 */
  items: SpellItem[];
  count: number;

  setEnabled: (enabled: boolean) => void;
  setOnline: (online: boolean) => void;
  setOnlineState: (state: OnlineSpellState) => void;
  ignore: (key: string) => void;
  setItems: (items: SpellItem[]) => void;
}

export const useSpellStore = create<SpellState>((set, get) => ({
  enabled: read(ENABLED_KEY, true),
  online: read(ONLINE_KEY, true),
  onlineState: "unknown",
  ignored: read<string[]>(IGNORED_KEY, []),
  items: [],
  count: 0,

  setEnabled: (enabled) => {
    write(ENABLED_KEY, enabled);
    set({ enabled });
  },
  setOnline: (online) => {
    write(ONLINE_KEY, online);
    set({ online, onlineState: "unknown" });
  },
  setOnlineState: (onlineState) => {
    if (get().onlineState !== onlineState) set({ onlineState });
  },
  ignore: (key) => {
    if (get().ignored.includes(key)) return;
    const ignored = [...get().ignored, key];
    write(IGNORED_KEY, ignored);
    set({ ignored });
  },
  setItems: (items) => set({ items, count: items.length }),
}));
