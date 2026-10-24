import { FilePlus2, FolderOpen, PenLine } from "lucide-react";
import { useEffect } from "react";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { NoteEditor } from "@/features/editor/ui/note-editor";
import { GraphView } from "@/features/graph/ui/graph-view";
import { Sidebar } from "@/features/note-list/ui/sidebar";
import { TemplateDialogs } from "@/features/templates/ui/template-dialogs";
import { CommandPalette } from "@/features/search/ui/command-palette";
import { Button } from "@/shared/ui/button";

import { RightPanel } from "./right-panel";

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
      <Button variant="outline" size="sm" onClick={() => void createNote()}>
        <FilePlus2 /> 새 글
      </Button>
    </div>
  );
}

export function AppShell() {
  const ready = useWorkspaceStore((state) => state.ready);
  const root = useWorkspaceStore((state) => state.root);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const view = useUiStore((state) => state.view);
  const rightPanelOpen = useUiStore((state) => state.rightPanelOpen);
  const activeName = useWorkspaceStore((state) => state.notes.find((note) => note.path === state.activePath)?.name);

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

  if (!ready) return null;
  if (!root) return <WelcomeScreen />;

  return (
    <div className="flex h-screen">
      <span aria-label="앱 버전" className="pointer-events-none fixed right-3 bottom-1.5 z-30 text-[11px] text-muted-foreground/70 select-none">
        v{__APP_VERSION__}
      </span>
      <Sidebar />
      <main className="min-w-0 flex-1">
        {view === "graph" ? (
          <GraphView />
        ) : activePath && activeName !== undefined ? (
          <NoteEditor key={activePath} path={activePath} name={activeName} />
        ) : (
          <EmptyEditor />
        )}
      </main>
      {view === "editor" && rightPanelOpen && <RightPanel />}
      <CommandPalette />
      <TemplateDialogs />
    </div>
  );
}
