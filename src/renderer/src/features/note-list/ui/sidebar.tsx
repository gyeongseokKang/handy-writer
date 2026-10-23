import { FolderOpen, GitBranch, Network, PanelRight, PenLine, Plus, Search } from "lucide-react";

import { useGitStore } from "@/entities/git/model/use-git-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { TagList } from "@/features/tag-browser/ui/tag-list";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { NoteTree } from "./note-tree";

export function Sidebar() {
  const root = useWorkspaceStore((state) => state.root);
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const createNote = useWorkspaceStore((state) => state.createNote);
  const chooseFolder = useWorkspaceStore((state) => state.chooseFolder);

  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const sidebarView = useUiStore((state) => state.sidebarView);
  const setSidebarView = useUiStore((state) => state.setSidebarView);
  const rightPanelOpen = useUiStore((state) => state.rightPanelOpen);
  const toggleRightPanel = useUiStore((state) => state.toggleRightPanel);

  const gitStatus = useGitStore((state) => state.status);
  const setRightTab = useUiStore((state) => state.setRightTab);

  const folderName = root?.split(/[\\/]/).filter(Boolean).pop() ?? "";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/40">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <PenLine className="size-4" />
        <span className="flex-1 font-semibold">Handy Writer</span>
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-7", view === "graph" && "bg-accent")}
          title="그래프 보기"
          aria-label="그래프 보기"
          aria-pressed={view === "graph"}
          onClick={() => setView(view === "graph" ? "editor" : "graph")}
        >
          <Network />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-7", rightPanelOpen && "bg-accent")}
          title="연결 정보 패널"
          aria-label="연결 정보 패널"
          aria-pressed={rightPanelOpen}
          onClick={toggleRightPanel}
        >
          <PanelRight />
        </Button>
      </div>

      <div role="tablist" aria-label="사이드바 보기" className="mx-3 mb-2 grid grid-cols-2 rounded-md bg-muted p-0.5 text-sm">
        {(["notes", "tags"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={sidebarView === tab}
            onClick={() => setSidebarView(tab)}
            className={cn(
              "rounded-[5px] py-1 text-center text-muted-foreground",
              sidebarView === tab && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            {tab === "notes" ? "글" : "태그"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 pb-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={sidebarView === "notes" ? "글 검색" : "태그 검색"}
            aria-label="글 검색"
            className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <Button size="icon" variant="outline" className="size-8" title="새 글" aria-label="새 글" onClick={() => void createNote()}>
          <Plus />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sidebarView === "notes" ? <NoteTree /> : <TagList />}
      </div>

      {gitStatus?.isRepo && (
        <button
          type="button"
          onClick={() => setRightTab("git")}
          title="Git 패널 열기"
          aria-label="Git 상태"
          className="flex items-center gap-2 border-t px-4 py-2 text-left text-xs text-muted-foreground hover:bg-accent/70"
        >
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{gitStatus.branch ?? "HEAD"}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {gitStatus.changes.length > 0 && <span className="text-amber-600">● {gitStatus.changes.length}</span>}
            {gitStatus.ahead > 0 && <span>↑{gitStatus.ahead}</span>}
            {gitStatus.behind > 0 && <span>↓{gitStatus.behind}</span>}
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={() => void chooseFolder()}
        title={root ?? undefined}
        className="flex items-center gap-2 border-t px-4 py-2.5 text-left text-xs text-muted-foreground hover:bg-accent/70"
      >
        <FolderOpen className="size-4 shrink-0" />
        <span className="truncate">{folderName || "작업 폴더 선택"}</span>
      </button>
    </aside>
  );
}
