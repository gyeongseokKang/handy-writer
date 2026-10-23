import { create } from "zustand";

type MainView = "editor" | "graph";
type SidebarView = "notes" | "tags";
type RightTab = "links" | "ai";

interface UiState {
  view: MainView;
  sidebarView: SidebarView;
  selectedTag: string | null;
  rightPanelOpen: boolean;
  rightTab: RightTab;

  setView: (view: MainView) => void;
  setSidebarView: (view: SidebarView) => void;
  selectTag: (tag: string | null) => void;
  /** 태그 목록에서 해당 태그를 펼쳐 보여준다. */
  showTag: (tag: string) => void;
  toggleRightPanel: () => void;
  setRightTab: (tab: RightTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "editor",
  sidebarView: "notes",
  selectedTag: null,
  rightPanelOpen: true,
  rightTab: "links",

  setView: (view) => set({ view }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  selectTag: (selectedTag) => set({ selectedTag }),
  showTag: (tag) => set({ sidebarView: "tags", selectedTag: tag, view: "editor" }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightTab: (rightTab) => set({ rightTab, rightPanelOpen: true }),
}));
