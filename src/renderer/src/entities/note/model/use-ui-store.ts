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

const SIDEBAR_WIDTH_KEY = "handy-writer:sidebar-width";
/** 왼쪽 사이드바 너비(px). 오른쪽 가장자리를 끌어 바꾸고 이 컴퓨터에 기억한다. */
export const DEFAULT_SIDEBAR_WIDTH = 256;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 480;

const clampSidebarWidth = (width: number) => Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)));

const RIGHT_PANEL_WIDTH_KEY = "handy-writer:right-panel-width";
/** 오른쪽 패널(연결·첨부·AI·맞춤법·Git) 너비(px). 왼쪽 가장자리를 끌어 바꾸고 이 컴퓨터에 기억한다. */
export const DEFAULT_RIGHT_PANEL_WIDTH = 320;
export const MIN_RIGHT_PANEL_WIDTH = 260;
export const MAX_RIGHT_PANEL_WIDTH = 640;

const clampRightPanelWidth = (width: number) => Math.round(Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, width)));

function readRightPanelWidth() {
  try {
    const value = Number(localStorage.getItem(RIGHT_PANEL_WIDTH_KEY));
    return value > 0 ? clampRightPanelWidth(value) : DEFAULT_RIGHT_PANEL_WIDTH;
  } catch {
    return DEFAULT_RIGHT_PANEL_WIDTH;
  }
}

function readSidebarWidth() {
  try {
    const value = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return value > 0 ? clampSidebarWidth(value) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

const OUTLINE_PINNED_KEY = "handy-writer:outline-pinned";
const SIDEBAR_OPEN_KEY = "handy-writer:sidebar-open";
const TAB_PER_CLICK_KEY = "handy-writer:tab-per-click";
const FOCUS_DIM_KEY = "handy-writer:focus-dim";
const TYPEWRITER_KEY = "handy-writer:typewriter";

/** 집중 모드 설정은 기본 켜짐이고 이 컴퓨터에 기억한다. */
function readFlag(key: string, fallback = true) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value !== "0";
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // 저장소를 못 써도 이번 실행에서는 적용된다.
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
  /** 왼쪽 사이드바를 펼쳤는지 (이 컴퓨터에 기억) */
  sidebarOpen: boolean;
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
  /** 도움말(기능 안내) 창. helpFeature가 있으면 그 기능으로 바로 간다. */
  helpOpen: boolean;
  helpFeature: string | null;
  /** 집중 모드: 사이드바·탭·패널을 숨기고 글만 보여 준다 */
  focusMode: boolean;
  /** 집중 모드에서 지금 쓰는 문단만 진하게 */
  focusDim: boolean;
  /** 집중 모드에서 커서 줄을 화면 가운데에 둔다 (타자기 스크롤) */
  typewriter: boolean;
  /** 사이드바 옆의 목차 패널 */
  outlineOpen: boolean;
  /** 떠 있는 목차를 마우스를 올리지 않아도 전체가 펼쳐진 채로 둔다 (이 컴퓨터에 기억) */
  outlinePinned: boolean;
  /** 목록에서 글을 누르면 새 탭으로 연다 (끄면 지금 탭을 바꾼다. Cmd/Ctrl+클릭은 반대로) */
  tabPerClick: boolean;
  setTabPerClick: (value: boolean) => void;
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
  /** 왼쪽 사이드바 너비(px). 오른쪽 가장자리 손잡이로 조절하고 이 컴퓨터에 기억한다. */
  sidebarWidth: number;
  rightPanelWidth: number;
  /** 변경 기록 화면에서 보고 있는 글 */
  historyTarget: { path: string; name: string } | null;
  /** 링크에서 글 가져오기 창. new: 새 글로, insert: 지금 글의 커서 아래에 넣는 것을 먼저 권한다. */
  extract: { mode: "new" | "insert" } | null;
  /** 단축키(찾기, 복사 등)가 향할 에디터: "main" 또는 분할 화면 글의 경로 (마지막으로 포커스한 쪽) */
  focusedPane: string;

  setView: (view: MainView) => void;
  setSidebarView: (view: SidebarView) => void;
  selectTag: (tag: string | null) => void;
  /** 태그 목록에서 해당 태그를 펼쳐 보여준다. */
  showTag: (tag: string) => void;
  toggleRightPanel: () => void;
  toggleSidebar: () => void;
  /** 창 너비가 바뀔 때 부른다. 좁으면 오른쪽 패널을 접고, 다시 넓어지면 저절로 접었던 것만 펼친다. */
  setNarrow: (narrow: boolean) => void;
  requestEditor: (kind: EditorRequestKind) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setStyleSettingsOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  setManuscriptFolder: (folder: string | null) => void;
  setStatsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean, feature?: string) => void;
  setFocusMode: (on: boolean) => void;
  toggleFocusMode: () => void;
  setFocusDim: (on: boolean) => void;
  setTypewriter: (on: boolean) => void;
  toggleOutline: () => void;
  setOutlinePinned: (pinned: boolean) => void;
  setDraftOpen: (open: boolean) => void;
  setRightTab: (tab: RightTab) => void;
  /** Git 화면을 열고 닫는다. 열 때는 오른쪽 패널도 연다. */
  toggleGit: () => void;
  closeGit: () => void;
  setPaletteOpen: (open: boolean, initial?: string) => void;
  setPendingFind: (term: string | null) => void;
  setEditorWidth: (width: number) => void;
  /** persist가 false면 화면에만 반영한다(끄는 동안). 끝날 때 한 번 저장한다. */
  setSidebarWidth: (width: number, persist?: boolean) => void;
  /** persist가 false면 화면에만 반영한다(끄는 동안). 끝날 때 한 번 저장한다. */
  setRightPanelWidth: (width: number, persist?: boolean) => void;
  setHistoryTarget: (target: { path: string; name: string } | null) => void;
  setFocusedPane: (pane: string) => void;
  setExtract: (extract: { mode: "new" | "insert" } | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "editor",
  sidebarView: "notes",
  selectedTag: null,
  rightPanelOpen: true,
  sidebarOpen: readFlag(SIDEBAR_OPEN_KEY),
  rightPanelAutoClosed: false,
  editorRequest: null,
  settingsOpen: false,
  shortcutsOpen: false,
  styleSettingsOpen: false,
  onboardingOpen: false,
  manuscriptFolder: null,
  statsOpen: false,
  helpOpen: false,
  helpFeature: null,
  focusMode: false,
  focusDim: readFlag(FOCUS_DIM_KEY),
  typewriter: readFlag(TYPEWRITER_KEY),
  outlineOpen: true,
  outlinePinned: readFlag(OUTLINE_PINNED_KEY, false),
  tabPerClick: readFlag(TAB_PER_CLICK_KEY),
  setTabPerClick: (tabPerClick) => {
    saveFlag(TAB_PER_CLICK_KEY, tabPerClick);
    set({ tabPerClick });
  },
  draftOpen: false,
  rightTab: "links",
  gitOpen: false,
  paletteOpen: false,
  paletteInitial: "",
  pendingFind: null,
  editorWidth: readEditorWidth(),
  sidebarWidth: readSidebarWidth(),
  rightPanelWidth: readRightPanelWidth(),
  historyTarget: null,
  focusedPane: "main",
  extract: null,

  setView: (view) => set({ view }),
  setSidebarView: (sidebarView) => set({ sidebarView }),
  selectTag: (selectedTag) => set({ selectedTag }),
  showTag: (tag) => set({ sidebarView: "tags", selectedTag: tag, view: "editor" }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen, rightPanelAutoClosed: false })),
  toggleSidebar: () => set((state) => {
    saveFlag(SIDEBAR_OPEN_KEY, !state.sidebarOpen);
    return { sidebarOpen: !state.sidebarOpen };
  }),
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
  setHelpOpen: (helpOpen, feature) => set({ helpOpen, helpFeature: helpOpen ? (feature ?? null) : null }),
  setFocusMode: (focusMode) => set({ focusMode }),
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setFocusDim: (focusDim) => {
    saveFlag(FOCUS_DIM_KEY, focusDim);
    set({ focusDim });
  },
  setTypewriter: (typewriter) => {
    saveFlag(TYPEWRITER_KEY, typewriter);
    set({ typewriter });
  },
  toggleOutline: () => set((state) => ({ outlineOpen: !state.outlineOpen })),
  setOutlinePinned: (outlinePinned) => {
    saveFlag(OUTLINE_PINNED_KEY, outlinePinned);
    set({ outlinePinned });
  },
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
  setSidebarWidth: (width, persist = true) => {
    const sidebarWidth = clampSidebarWidth(width);
    set({ sidebarWidth });
    if (!persist) return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      // 저장소를 못 써도 이번 실행에서는 적용된다.
    }
  },
  setRightPanelWidth: (width, persist = true) => {
    const rightPanelWidth = clampRightPanelWidth(width);
    set({ rightPanelWidth });
    if (!persist) return;
    try {
      localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(rightPanelWidth));
    } catch {
      // 저장소를 못 써도 이번 실행에서는 적용된다.
    }
  },
  setHistoryTarget: (historyTarget) => set({ historyTarget }),
  setFocusedPane: (focusedPane) => set({ focusedPane }),
  setExtract: (extract) => set({ extract }),
}));
