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

/** 명령 팔레트가 지금 에디터에 시키는 일 */
export type EditorRequestKind = "find" | "copy-rich" | "export-md" | "export-html" | "export-pdf" | "export-docx";

type MainView = "editor" | "graph";
type SidebarView = "notes" | "tags";
export type RightTab = "links" | "files" | "ai" | "spell";

interface UiState {
  view: MainView;
  sidebarView: SidebarView;
  selectedTag: string | null;
  rightPanelOpen: boolean;
  /** 창이 좁아서 오른쪽 패널을 저절로 접었는지. 다시 넓어지면 펼친다. 손으로 열고 닫으면 풀린다. */
  rightPanelAutoClosed: boolean;
  /** 지금 에디터에 보내는 요청 (명령 팔레트 등에서). seq가 바뀌면 단축키 대상 에디터가 처리한다. */
  editorRequest: { kind: EditorRequestKind; seq: number } | null;
  /** 설정 창, 단축키 안내, 문장 다듬기 설정, 시작 안내 */
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  styleSettingsOpen: boolean;
  onboardingOpen: boolean;
  /** 원고 창에 띄운 폴더 (""은 작업 폴더 전체, null이면 닫힘) */
  manuscriptFolder: string | null;
  /** 오늘 쓴 양 창 */
  statsOpen: boolean;
  /** 사이드바 옆의 목차 패널 */
  outlineOpen: boolean;
  /** AI 초안 만들기 창 */
  draftOpen: boolean;
  rightTab: RightTab;
  /** 오른쪽 패널을 탭 대신 Git 화면으로 덮고 있는지 (왼쪽 아래 브랜치를 눌러 연다) */
  gitOpen: boolean;
  paletteOpen: boolean;
  /** 검색 창을 열 때 미리 넣어 둘 글 (`>`면 명령 모드로 연다) */
  paletteInitial: string;
  /** 검색 결과에서 연 글에서 처음 보여줄 단어 */
  pendingFind: string | null;
  /** 글 칸의 최대 너비(px). 양쪽 손잡이로 조절하고 이 컴퓨터에 기억한다. */
  editorWidth: number;
  /** 변경 기록 화면에서 보고 있는 글 */
  historyTarget: { path: string; name: string } | null;
  /** 링크에서 글 가져오기 창. new: 새 글로, insert: 지금 글의 커서 아래에 넣는 것을 먼저 권한다. */
  extract: { mode: "new" | "insert" } | null;
  /** 단축키(찾기, 복사 등)가 향할 에디터. 분할 화면이면 마지막으로 포커스한 쪽 */
  focusedPane: "main" | "side";

  setView: (view: MainView) => void;
  setSidebarView: (view: SidebarView) => void;
  selectTag: (tag: string | null) => void;
  /** 태그 목록에서 해당 태그를 펼쳐 보여준다. */
  showTag: (tag: string) => void;
  toggleRightPanel: () => void;
  /** 창 너비가 바뀔 때 부른다. 좁으면 오른쪽 패널을 접고, 다시 넓어지면 저절로 접었던 것만 펼친다. */
  setNarrow: (narrow: boolean) => void;
  requestEditor: (kind: EditorRequestKind) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setStyleSettingsOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  setManuscriptFolder: (folder: string | null) => void;
  setStatsOpen: (open: boolean) => void;
  toggleOutline: () => void;
  setDraftOpen: (open: boolean) => void;
  setRightTab: (tab: RightTab) => void;
  /** Git 화면을 열고 닫는다. 열 때는 오른쪽 패널도 연다. */
  toggleGit: () => void;
  closeGit: () => void;
  setPaletteOpen: (open: boolean, initial?: string) => void;
  setPendingFind: (term: string | null) => void;
  setEditorWidth: (width: number) => void;
  setHistoryTarget: (target: { path: string; name: string } | null) => void;
  setFocusedPane: (pane: "main" | "side") => void;
  setExtract: (extract: { mode: "new" | "insert" } | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "editor",
  sidebarView: "notes",
  selectedTag: null,
  rightPanelOpen: true,
  rightPanelAutoClosed: false,
  editorRequest: null,
  settingsOpen: false,
  shortcutsOpen: false,
  styleSettingsOpen: false,
  onboardingOpen: false,
  manuscriptFolder: null,
  statsOpen: false,
  outlineOpen: true,
  draftOpen: false,
  rightTab: "links",
  gitOpen: false,
  paletteOpen: false,
  paletteInitial: "",
  pendingFind: null,
  editorWidth: readEditorWidth(),
  historyTarget: null,
  focusedPane: "main",
  extract: null,

  setView: (view) => set({ view }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  selectTag: (selectedTag) => set({ selectedTag }),
  showTag: (tag) => set({ sidebarView: "tags", selectedTag: tag, view: "editor" }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen, rightPanelAutoClosed: false })),
  setNarrow: (narrow) =>
    set((state) => {
      if (narrow && state.rightPanelOpen) return { rightPanelOpen: false, rightPanelAutoClosed: true };
      if (!narrow && state.rightPanelAutoClosed) return { rightPanelOpen: true, rightPanelAutoClosed: false };
      return {};
    }),
  requestEditor: (kind) => set((state) => ({ editorRequest: { kind, seq: (state.editorRequest?.seq ?? 0) + 1 } })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setStyleSettingsOpen: (styleSettingsOpen) => set({ styleSettingsOpen }),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  setManuscriptFolder: (manuscriptFolder) => set({ manuscriptFolder }),
  setStatsOpen: (statsOpen) => set({ statsOpen }),
  toggleOutline: () => set((state) => ({ outlineOpen: !state.outlineOpen })),
  setDraftOpen: (draftOpen) => set({ draftOpen }),
  setRightTab: (rightTab) => set({ rightTab, rightPanelOpen: true, gitOpen: false }),
  toggleGit: () => set((state) => (state.gitOpen && state.rightPanelOpen ? { gitOpen: false } : { gitOpen: true, rightPanelOpen: true })),
  closeGit: () => set({ gitOpen: false }),
  setPaletteOpen: (paletteOpen, paletteInitial = "") => set({ paletteOpen, paletteInitial }),
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
  setHistoryTarget: (historyTarget) => set({ historyTarget }),
  setFocusedPane: (focusedPane) => set({ focusedPane }),
  setExtract: (extract) => set({ extract }),
}));
