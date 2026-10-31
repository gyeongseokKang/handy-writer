import { Download, FilePlus2, FolderOpen, PenLine, Sparkles } from "lucide-react";
import { useEffect } from "react";

import { useCommandStore } from "@/entities/command/model/use-command-store";
import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { useLogStore } from "@/entities/log/model/use-log-store";
import { api } from "@/shared/api/handy-api";
import { flushAll, unsavedPaths } from "@/shared/lib/pending-saves";
import { DraftDialog } from "@/features/draft/ui/draft-dialog";
import { LogPanel } from "@/features/log/ui/log-panel";
import { NoteEditor } from "@/features/editor/ui/note-editor";
import { ExtractDialog } from "@/features/editor/ui/extract-dialog";
import { StyleSettings } from "@/features/editor/ui/style-settings";
import { HistoryView } from "@/features/history/ui/history-view";
import { GraphView } from "@/features/graph/ui/graph-view";
import { Sidebar } from "@/features/note-list/ui/sidebar";
import { OutlinePanel } from "@/features/outline/ui/outline-panel";
import { TemplateDialogs } from "@/features/templates/ui/template-dialogs";
import { CommandPalette } from "@/features/search/ui/command-palette";
import { Button } from "@/shared/ui/button";

import { TabBar, toggleSplit } from "@/features/note-tabs/ui/tab-bar";

import { EditorArea } from "./editor-area";
import { buildCommands } from "../model/commands";
import { OnboardingDialog, wasOnboarded } from "./onboarding-dialog";
import { ManuscriptDialog } from "@/features/manuscript/ui/manuscript-dialog";
import { RightPanel } from "./right-panel";
import { SettingsDialog } from "./settings-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";

/** 이보다 좁은 창에서는 오른쪽 패널을 저절로 접는다 */
const NARROW_WINDOW = 1000;

function WelcomeScreen() {
  const chooseFolder = useWorkspaceStore((state) => state.chooseFolder);
  const useDefaultFolder = useWorkspaceStore((state) => state.useDefaultFolder);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <PenLine className="size-10 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Handy Writer</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          글은 작업 폴더에 마크다운(.md) 파일로 저장돼요. Obsidian 볼트나 git 저장소 폴더를 그대로 선택해도 돼요.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => void chooseFolder()}>
          <FolderOpen /> 작업 폴더 선택
        </Button>
        <Button variant="outline" onClick={() => void useDefaultFolder()}>
          문서/HandyWriter 사용
        </Button>
      </div>
    </div>
  );
}

function EmptyEditor() {
  const createNote = useWorkspaceStore((state) => state.createNote);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <p className="text-sm">왼쪽에서 글을 고르거나 새 글을 만들어 보세요.</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void createNote()}>
          <FilePlus2 /> 새 글
        </Button>
        <Button variant="outline" size="sm" onClick={() => useUiStore.getState().setDraftOpen(true)}>
          <Sparkles /> AI로 초안 만들기
        </Button>
        <Button variant="outline" size="sm" onClick={() => useUiStore.getState().setExtract({ mode: "new" })}>
          <Download /> 링크에서 가져오기
        </Button>
      </div>
    </div>
  );
}

export function AppShell() {
  const ready = useWorkspaceStore((state) => state.ready);
  const root = useWorkspaceStore((state) => state.root);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const view = useUiStore((state) => state.view);
  const rightPanelOpen = useUiStore((state) => state.rightPanelOpen);
  const outlineOpen = useUiStore((state) => state.outlineOpen);
  const draftOpen = useUiStore((state) => state.draftOpen);
  const historyTarget = useUiStore((state) => state.historyTarget);
  const extract = useUiStore((state) => state.extract);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const shortcutsOpen = useUiStore((state) => state.shortcutsOpen);
  const styleSettingsOpen = useUiStore((state) => state.styleSettingsOpen);
  const onboardingOpen = useUiStore((state) => state.onboardingOpen);
  const manuscriptFolder = useUiStore((state) => state.manuscriptFolder);
  const logOpen = useLogStore((state) => state.open);
  const activeName = useWorkspaceStore((state) => state.notes.find((note) => note.path === state.activePath)?.name);

  // Cmd/Ctrl+Shift+H로 지금 글의 변경 기록을 연다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== "h") return;
      const { activePath, splitPath, notes } = useWorkspaceStore.getState();
      // 분할 화면이면 마지막으로 만진 쪽 글의 기록을 연다.
      const target = splitPath && useUiStore.getState().focusedPane === "side" ? splitPath : activePath;
      const note = notes.find((n) => n.path === target);
      if (!note) return;
      event.preventDefault();
      useUiStore.getState().setHistoryTarget({ path: note.path, name: note.name });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // 탭 단축키: Ctrl+Tab(Shift면 거꾸로) 다음 탭, Cmd/Ctrl+1~9 그 순서의 탭(9는 마지막), Cmd/Ctrl+\ 분할 화면.
  // Cmd/Ctrl+W는 기본 메뉴가 창을 닫지 않도록 메인 프로세스가 가로채서 보내 준다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!useWorkspaceStore.getState().root || useUiStore.getState().historyTarget) return;
      const ws = useWorkspaceStore.getState();
      if (event.ctrlKey && !event.altKey && event.key === "Tab") {
        event.preventDefault();
        void ws.cycleTab(event.shiftKey ? -1 : 1);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key === "\\") {
        event.preventDefault();
        toggleSplit();
      } else if (/^[1-9]$/.test(event.key) && ws.tabs.length > 0) {
        event.preventDefault();
        const index = event.key === "9" ? ws.tabs.length - 1 : Number(event.key) - 1;
        const path = ws.tabs[index];
        if (path) void ws.openNote(path);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    // 창을 닫기 전에 저장할 것을 모두 쓰고, 그래도 못 쓴 글을 메인 프로세스에 알린다.
    const offBeforeClose = api.app.onBeforeClose(() => {
      void flushAll().then(() => api.app.closeReady(unsavedPaths()));
    });
    const offClose = api.onCloseTab(() => {
      const { activePath, closeTab } = useWorkspaceStore.getState();
      if (activePath && !useUiStore.getState().historyTarget) void closeTab(activePath);
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      offClose();
      offBeforeClose();
    };
  }, []);

  // 명령 팔레트와 단축키 안내가 쓰는 명령을 등록한다.
  useEffect(() => useCommandStore.getState().setCommands(buildCommands()), []);

  // 앱 단축키: Cmd/Ctrl+/ 단축키 안내, Cmd/Ctrl+, 설정, Cmd/Ctrl+Shift+P 명령, Cmd/Ctrl+Shift+T 닫은 탭 다시 열기
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || !useWorkspaceStore.getState().root) return;
      const key = event.key.toLowerCase();
      const ui = useUiStore.getState();
      let handled = true;
      if (!event.shiftKey && key === "/") ui.setShortcutsOpen(!ui.shortcutsOpen);
      else if (!event.shiftKey && key === ",") ui.setSettingsOpen(true);
      else if (event.shiftKey && key === "p") ui.setPaletteOpen(true, ">");
      else if (event.shiftKey && key === "t") void useWorkspaceStore.getState().reopenClosedTab();
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // 창이 좁으면 오른쪽 패널을 저절로 접고, 다시 넓어지면 펼친다.
  useEffect(() => {
    const onResize = () => useUiStore.getState().setNarrow(window.innerWidth < NARROW_WINDOW);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Cmd/Ctrl+K 또는 Cmd/Ctrl+P로 글 검색을 연다. 에디터가 먼저 키를 가져가지 못하게 캡처 단계에서 받는다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "k" && event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      const { paletteOpen, setPaletteOpen } = useUiStore.getState();
      if (useWorkspaceStore.getState().root) setPaletteOpen(!paletteOpen);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // 작업 폴더마다 내 표기 사전(.handy-writer/style.md)을 읽는다. 처음 실행이면 시작 안내를 띄운다.
  useEffect(() => {
    if (!root) return;
    void useSpellStore.getState().loadDictionary();
    if (!wasOnboarded()) useUiStore.getState().setOnboardingOpen(true);
  }, [root]);

  if (!ready) return null;
  if (!root) return <WelcomeScreen />;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {view === "graph" ? (
          <GraphView />
        ) : (
          <>
            <TabBar />
            <EditorArea
              main={
                <>
                  {outlineOpen && activePath && <OutlinePanel />}
                  {activePath && activeName !== undefined ? <NoteEditor key={activePath} path={activePath} name={activeName} /> : <EmptyEditor />}
                </>
              }
            />
          </>
        )}
        {logOpen && <LogPanel />}
      </main>
      {view === "editor" && rightPanelOpen && <RightPanel />}
      <CommandPalette />
      <TemplateDialogs />
      {draftOpen && <DraftDialog />}
      {extract && <ExtractDialog mode={extract.mode} />}
      {settingsOpen && <SettingsDialog />}
      {shortcutsOpen && <ShortcutsDialog />}
      {styleSettingsOpen && <StyleSettings onClose={() => useUiStore.getState().setStyleSettingsOpen(false)} />}
      {onboardingOpen && <OnboardingDialog />}
      {manuscriptFolder !== null && <ManuscriptDialog key={manuscriptFolder} folder={manuscriptFolder} />}
      {historyTarget && <HistoryView key={historyTarget.path} path={historyTarget.path} name={historyTarget.name} />}
    </div>
  );
}
