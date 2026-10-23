import { ChevronRight, FileText, Hash } from "lucide-react";
import { useMemo } from "react";

import { collectTags } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";

export function TagList() {
  const entries = useNoteIndexStore((state) => state.entries);
  const query = useWorkspaceStore((state) => state.query);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openNote = useWorkspaceStore((state) => state.openNote);
  const selectedTag = useUiStore((state) => state.selectedTag);
  const selectTag = useUiStore((state) => state.selectTag);

  const nameByPath = useMemo(() => new Map(entries.map((entry) => [entry.path, entry.name])), [entries]);
  const tags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = collectTags(entries);
    return needle ? all.filter((summary) => summary.tag.toLowerCase().includes(needle)) : all;
  }, [entries, query]);

  if (tags.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {query.trim() ? "검색 결과가 없어요" : "아직 태그가 없어요. 글에 #태그를 써 보세요."}
      </p>
    );
  }

  return (
    <ul aria-label="태그 목록" className="flex flex-col gap-px px-2 pb-4">
      {tags.map(({ tag, paths }) => {
        const open = selectedTag?.toLowerCase() === tag.toLowerCase();
        return (
          <li key={tag}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => selectTag(open ? null : tag)}
              className="flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left text-sm hover:bg-accent/70"
            >
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
              <Hash className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{tag}</span>
              <span className="text-xs text-muted-foreground">{paths.length}</span>
            </button>
            {open && (
              <ul className="mb-1">
                {paths.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => void openNote(path)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-left text-sm hover:bg-accent/70",
                        activePath === path && "bg-accent font-medium text-accent-foreground",
                      )}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{nameByPath.get(path) ?? path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
