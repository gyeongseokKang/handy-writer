import { create } from "zustand";

import type { EmbedItem } from "./use-editor-bridge";

interface EmbedState {
  /** 지금 열린 글에 들어 있는 임베드 (글 안의 순서) */
  items: EmbedItem[];
  setItems: (items: EmbedItem[]) => void;
  /** 글에서 누른 임베드: 첨부 탭이 그 항목을 펼쳐 보여 준다 (seq는 같은 것을 다시 눌러도 알아채게) */
  revealed: { uid: string; seq: number } | null;
  reveal: (uid: string) => void;
}

const same = (a: EmbedItem[], b: EmbedItem[]) => JSON.stringify(a) === JSON.stringify(b);

export const useEmbedStore = create<EmbedState>((set, get) => ({
  items: [],
  revealed: null,
  reveal: (uid) => set((state) => ({ revealed: { uid, seq: (state.revealed?.seq ?? 0) + 1 } })),
  setItems: (items) => {
    if (!same(get().items, items)) set({ items });
  },
}));
