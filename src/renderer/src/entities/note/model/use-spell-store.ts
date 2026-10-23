import { create } from "zustand";

const ENABLED_KEY = "handy-writer:spellcheck";
const IGNORED_KEY = "handy-writer:spellcheck-ignored";

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

interface SpellState {
  enabled: boolean;
  /** 사용자가 "무시"한 항목의 키 (규칙:낱말) */
  ignored: string[];
  /** 지금 열린 글에서 표시 중인 맞춤법 항목 수 */
  count: number;

  setEnabled: (enabled: boolean) => void;
  ignore: (key: string) => void;
  setCount: (count: number) => void;
}

export const useSpellStore = create<SpellState>((set, get) => ({
  enabled: read(ENABLED_KEY, true),
  ignored: read<string[]>(IGNORED_KEY, []),
  count: 0,

  setEnabled: (enabled) => {
    write(ENABLED_KEY, enabled);
    set({ enabled });
  },
  ignore: (key) => {
    if (get().ignored.includes(key)) return;
    const ignored = [...get().ignored, key];
    write(IGNORED_KEY, ignored);
    set({ ignored });
  },
  setCount: (count) => {
    if (get().count !== count) set({ count });
  },
}));
