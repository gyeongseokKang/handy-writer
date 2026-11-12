import { CircleHelp, Download, Network, PenLine, Plus, Search } from "lucide-react";

import { UpdateRow } from "./update-row";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { TagList } from "@/features/tag-browser/ui/tag-list";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { SidebarResizeHandle } from "./sidebar-resize-handle";
import { WorkspaceSection } from "./workspace-section";
import { useTreeUi } from "../model/use-tree-ui";
import { ReviewSection } from "@/features/review/ui/review-section";

export function Sidebar() {
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const createNote = useWorkspaceStore((state) => state.createNote);

  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const sidebarView = useUiStore((state) => state.sidebarView);
  const setSidebarView = useUiStore((state) => state.setSidebarView);

  const sidebarWidth = useUiStore((state) => state.sidebarWidth);

  return (
    <aside style={{ width: sidebarWidth }} className="relative flex h-full shrink-0 flex-col border-r bg-muted/40">
      <SidebarResizeHandle />
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <PenLine className="size-4" />
        <span className="flex-1 truncate font-semibold whitespace-nowrap">Handy Writer</span>
        <div className="flex gap-0.5">
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
            className="size-7"
            title="도움말 — 기능 안내 (F1)"
            aria-label="도움말"
            onClick={() => useUiStore.getState().setHelpOpen(true)}
          >
            <CircleHelp />
          </Button>
        </div>
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
        <Button size="icon" variant="outline" className="size-8" title="전체 검색 (Ctrl/Cmd+K)" aria-label="전체 검색" onClick={() => useUiStore.getState().setPaletteOpen(true)}>
          <Search />
        </Button>
        <Button size="icon" variant="outline" className="size-8" title="링크에서 글 가져오기" aria-label="링크에서 글 가져오기" onClick={() => useUiStore.getState().setExtract({ mode: "new" })}>
          <Download />
        </Button>
        <Button size="icon" variant="outline" className="size-8" title="새 글" aria-label="새 글" onClick={() => void createNote()}>
          <Plus />
        </Button>
      </div>

      {/* 저장소마다 머리줄(Git) + 파일 트리. 길어지면 이 칸 전체가 스크롤되고 머리줄은 위에 붙는다. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        // 목록 아래 빈 곳을 우클릭해도 맨 위에 새 글·새 폴더를 만드는 메뉴가 뜬다.
        onContextMenu={(event) => {
          if (sidebarView !== "notes" || event.target !== event.currentTarget) return;
          event.preventDefault();
          useTreeUi.getState().openMenu(event.clientX, event.clientY, { kind: "root" });
        }}
      >
        {sidebarView === "notes" ? (
          <>
            <WorkspaceSection />
            <ReviewSection />
          </>
        ) : <TagList />}
      </div>

      <UpdateRow />

    </aside>
  );
}
