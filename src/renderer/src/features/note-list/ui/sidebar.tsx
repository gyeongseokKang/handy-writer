import { FolderOpen, PenLine, Plus, Search } from "lucide-react";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { Button } from "@/shared/ui/button";

import { NoteTree } from "./note-tree";

export function Sidebar() {
  const root = useWorkspaceStore((state) => state.root);
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const createNote = useWorkspaceStore((state) => state.createNote);
  const chooseFolder = useWorkspaceStore((state) => state.chooseFolder);

  const folderName = root?.split(/[\\/]/).filter(Boolean).pop() ?? "";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/40">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 font-semibold">
        <PenLine className="size-4" />
        Handy Writer
      </div>

      <div className="flex items-center gap-2 px-3 pb-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="글 검색"
            aria-label="글 검색"
            className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <Button size="icon" variant="outline" className="size-8" title="새 글" aria-label="새 글" onClick={() => void createNote()}>
          <Plus />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <NoteTree />
      </div>

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
