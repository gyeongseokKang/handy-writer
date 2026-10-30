import { create } from "zustand";

import type { SpellItem } from "@shared/spellcheck";
import { LONG_SENTENCE, parseStyleDictionary, type DictionaryEntry } from "@shared/style-lint";

import { api } from "@/shared/api/handy-api";

const ENABLED_KEY = "handy-writer:spellcheck";
const IGNORED_KEY = "handy-writer:spellcheck-ignored";
const ONLINE_KEY = "handy-writer:spellcheck-online";
const STYLE_KEY = "handy-writer:style-lint";
const STYLE_LONG_KEY = "handy-writer:style-long-sentence";
const STYLE_OFF_KEY = "handy-writer:style-off";

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
  /** 문장 다듬기(긴 문장, 되풀이, 겹말, 이중 피동 등)도 표시할지 */
  style: boolean;
  /** 이보다 긴 문장을 알린다 (컴퓨터별 설정) */
  longSentence: number;
  /** 끈 다듬기 규칙 묶음 (컴퓨터별 설정) */
  styleOff: string[];
  /** 작업 폴더의 내 표기 사전 원문과 읽은 항목 */
  dictionaryText: string;
  dictionary: DictionaryEntry[];
  /** 사용자가 "무시"한 항목의 키 (규칙:낱말) */
  ignored: string[];
  /** 지금 열린 글에서 표시 중인 맞춤법 항목 */
  items: SpellItem[];
  count: number;

  setEnabled: (enabled: boolean) => void;
  setOnline: (online: boolean) => void;
  setOnlineState: (state: OnlineSpellState) => void;
  setStyle: (style: boolean) => void;
  setLongSentence: (length: number) => void;
  setStyleGroup: (group: string, on: boolean) => void;
  /** 작업 폴더가 바뀌면 내 표기 사전을 다시 읽는다. */
  loadDictionary: () => Promise<void>;
  saveDictionary: (text: string) => Promise<void>;
  ignore: (key: string) => void;
  setItems: (items: SpellItem[]) => void;
}

export const useSpellStore = create<SpellState>((set, get) => ({
  enabled: read(ENABLED_KEY, true),
  online: read(ONLINE_KEY, true),
  onlineState: "unknown",
  style: read(STYLE_KEY, true),
  longSentence: read(STYLE_LONG_KEY, LONG_SENTENCE),
  styleOff: read<string[]>(STYLE_OFF_KEY, []),
  dictionaryText: "",
  dictionary: [],
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
  setStyle: (style) => {
    write(STYLE_KEY, style);
    set({ style });
  },
  setLongSentence: (length) => {
    const value = Math.max(20, Math.min(400, Math.round(length) || LONG_SENTENCE));
    write(STYLE_LONG_KEY, value);
    set({ longSentence: value });
  },
  setStyleGroup: (group, on) => {
    const styleOff = on ? get().styleOff.filter((g) => g !== group) : [...new Set([...get().styleOff, group])];
    write(STYLE_OFF_KEY, styleOff);
    set({ styleOff });
  },
  loadDictionary: async () => {
    const text = await api.styleDictionary.get().catch(() => "");
    set({ dictionaryText: text, dictionary: parseStyleDictionary(text) });
  },
  saveDictionary: async (text) => {
    await api.styleDictionary.set(text);
    set({ dictionaryText: text, dictionary: parseStyleDictionary(text) });
  },
  ignore: (key) => {
    if (get().ignored.includes(key)) return;
    const ignored = [...get().ignored, key];
    write(IGNORED_KEY, ignored);
    set({ ignored });
  },
  setItems: (items) => set({ items, count: items.length }),
}));
