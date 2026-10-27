import { create } from "zustand";

import type { HeadingItem } from "./use-editor-bridge";

interface OutlineState {
  /** 지금 열린 글의 제목들 (글 안의 순서) */
  headings: HeadingItem[];
  /** 커서가 속한 제목의 위치 */
  activePos: number | null;
  setHeadings: (headings: HeadingItem[]) => void;
  setActivePos: (pos: number | null) => void;
}

const same = (a: HeadingItem[], b: HeadingItem[]) => JSON.stringify(a) === JSON.stringify(b);

export const useOutlineStore = create<OutlineState>((set, get) => ({
  headings: [],
  activePos: null,
  setHeadings: (headings) => {
    if (!same(get().headings, headings)) set({ headings });
  },
  setActivePos: (activePos) => {
    if (get().activePos !== activePos) set({ activePos });
  },
}));
