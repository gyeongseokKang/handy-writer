import { create } from "zustand";

type MainView = "editor" | "graph";
type SidebarView = "notes" | "tags";
type RightTab = "links" | "files" | "ai" | "git";

interface UiState {
  view: MainView;
  sidebarView: SidebarView;
  selectedTag: string | null;
  rightPanelOpen: boolean;
  rightTab: RightTab;
  paletteOpen: boolean;
  /** 검색 결과에서 연 글에서 처음 보여줄 단어 */
  pendingFind: string | null;

  setView: (view: MainView) => void;
  setSidebarView: (view: SidebarView) => void;
  selectTag: (tag: string | null) => void;
  /** 태그 목록에서 해당 태그를 펼쳐 보여준다. */
  showTag: (tag: string) => void;
  toggleRightPanel: () => void;
  setRightTab: (tab: RightTab) => void;
  setPaletteOpen: (open: boolean) => void;
  setPendingFind: (term: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "editor",
  sidebarView: "notes",
  selectedTag: null,
  rightPanelOpen: true,
  rightTab: "links",
  paletteOpen: false,
  pendingFind: null,

  setView: (view) => set({ view }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  selectTag: (selectedTag) => set({ selectedTag }),
  showTag: (tag) => set({ sidebarView: "tags", selectedTag: tag, view: "editor" }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightTab: (rightTab) => set({ rightTab, rightPanelOpen: true }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setPendingFind: (pendingFind) => set({ pendingFind }),
}));
