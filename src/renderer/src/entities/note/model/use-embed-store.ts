import { create } from "zustand";

import type { EmbedItem } from "./use-editor-bridge";

interface EmbedState {
  /** 지금 열린 글에 들어 있는 임베드 (글 안의 순서) */
  items: EmbedItem[];
  setItems: (items: EmbedItem[]) => void;
}

const same = (a: EmbedItem[], b: EmbedItem[]) => JSON.stringify(a) === JSON.stringify(b);

export const useEmbedStore = create<EmbedState>((set, get) => ({
  items: [],
  setItems: (items) => {
    if (!same(get().items, items)) set({ items });
  },
}));
