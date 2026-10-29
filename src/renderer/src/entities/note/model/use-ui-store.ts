import { create } from "zustand";

const EDITOR_WIDTH_KEY = "handy-writer:editor-width";
/** 글 칸의 기본 너비(px, 좌우 여백 포함). 창이 이보다 좁으면 창에 맞춰 줄어든다. */
export const DEFAULT_EDITOR_WIDTH = 768;
export const MIN_EDITOR_WIDTH = 480;
export const MAX_EDITOR_WIDTH = 2400;

const clampEditorWidth = (width: number) => Math.round(Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, width)));

function readEditorWidth() {
  try {
    const value = Number(localStorage.getItem(EDITOR_WIDTH_KEY));
    return value > 0 ? clampEditorWidth(value) : DEFAULT_EDITOR_WIDTH;
  } catch {
    return DEFAULT_EDITOR_WIDTH;
  }
}

type MainView = "editor" | "graph";
type SidebarView = "notes" | "tags";
export type RightTab = "links" | "files" | "ai" | "spell";

interface UiState {
  view: MainView;
  sidebarView: SidebarView;
  selectedTag: string | null;
  rightPanelOpen: boolean;
  /** 사이드바 옆의 목차 패널 */
  outlineOpen: boolean;
  /** AI 초안 만들기 창 */
  draftOpen: boolean;
  rightTab: RightTab;
  /** 오른쪽 패널을 탭 대신 Git 화면으로 덮고 있는지 (왼쪽 아래 브랜치를 눌러 연다) */
  gitOpen: boolean;
  paletteOpen: boolean;
  /** 검색 결과에서 연 글에서 처음 보여줄 단어 */
  pendingFind: string | null;
  /** 글 칸의 최대 너비(px). 양쪽 손잡이로 조절하고 이 컴퓨터에 기억한다. */
  editorWidth: number;

  setView: (view: MainView) => void;
  setSidebarView: (view: SidebarView) => void;
  selectTag: (tag: string | null) => void;
  /** 태그 목록에서 해당 태그를 펼쳐 보여준다. */
  showTag: (tag: string) => void;
  toggleRightPanel: () => void;
  toggleOutline: () => void;
  setDraftOpen: (open: boolean) => void;
  setRightTab: (tab: RightTab) => void;
  /** Git 화면을 열고 닫는다. 열 때는 오른쪽 패널도 연다. */
  toggleGit: () => void;
  closeGit: () => void;
  setPaletteOpen: (open: boolean) => void;
  setPendingFind: (term: string | null) => void;
  setEditorWidth: (width: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "editor",
  sidebarView: "notes",
  selectedTag: null,
  rightPanelOpen: true,
  outlineOpen: true,
  draftOpen: false,
  rightTab: "links",
  gitOpen: false,
  paletteOpen: false,
  pendingFind: null,
  editorWidth: readEditorWidth(),

  setView: (view) => set({ view }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  selectTag: (selectedTag) => set({ selectedTag }),
  showTag: (tag) => set({ sidebarView: "tags", selectedTag: tag, view: "editor" }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  toggleOutline: () => set((state) => ({ outlineOpen: !state.outlineOpen })),
  setDraftOpen: (draftOpen) => set({ draftOpen }),
  setRightTab: (rightTab) => set({ rightTab, rightPanelOpen: true, gitOpen: false }),
  toggleGit: () => set((state) => (state.gitOpen && state.rightPanelOpen ? { gitOpen: false } : { gitOpen: true, rightPanelOpen: true })),
  closeGit: () => set({ gitOpen: false }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setPendingFind: (pendingFind) => set({ pendingFind }),
  setEditorWidth: (width) => {
    const editorWidth = clampEditorWidth(width);
    set({ editorWidth });
    try {
      localStorage.setItem(EDITOR_WIDTH_KEY, String(editorWidth));
    } catch {
      // 저장소를 못 써도 이번 실행에서는 적용된다.
    }
  },
}));
