import { FileText, Folder, StarOff } from "lucide-react";
import { useState } from "react";

import { useFavoritesStore, type Favorite } from "@/entities/note/model/use-favorites-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";

import { useTreeUi } from "../model/use-tree-ui";

/** 즐겨찾기한 폴더를 글 목록에서 펼치고 그 자리로 스크롤한다. */
function revealFolder(path: string) {
  useWorkspaceStore.setState((state) => {
    const collapsed = { ...state.collapsedFolders };
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) collapsed[parts.slice(0, i).join("/")] = false;
    return { collapsedFolders: collapsed };
  });
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-folder-path="${CSS.escape(path)}"]`);
    row?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

/** 사이드바 맨 위의 즐겨찾기. 누르면 글을 열고(폴더는 목록에서 펼치고), 끌어서 순서를 바꾼다. */
export function Favorites() {
  const items = useFavoritesStore((s) => s.items);
  const notes = useWorkspaceStore((s) => s.notes);
  const folders = useWorkspaceStore((s) => s.folders);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [dragging, setDragging] = useState<number | null>(null);

  // 지운 글·폴더는 목록에서 빼고 보여 준다 (다시 생기면 돌아온다).
  const visible = items
    .map((item, index) => ({ item, index, note: item.kind === "note" ? notes.find((n) => n.path === item.path) : undefined }))
    .filter(({ item, note }) => (item.kind === "note" ? !!note : folders.includes(item.path) || notes.some((n) => n.path.startsWith(`${item.path}/`))));
  if (visible.length === 0) return null;

  const open = (item: Favorite, event: React.MouseEvent) => {
    if (item.kind === "folder") return revealFolder(item.path);
    const ws = useWorkspaceStore.getState();
    if (event.altKey) void ws.openSplit(item.path);
    else void ws.openNote(item.path, { newTab: event.metaKey || event.ctrlKey });
  };

  return (
    <section aria-label="즐겨찾기" className="mb-2 px-2">
      <h2 className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">즐겨찾기</h2>
      <ul className="flex flex-col gap-px">
        {visible.map(({ item, index, note }) => {
          const name = note?.name ?? item.path.split("/").pop() ?? item.path;
          return (
            <li
              key={`${item.kind}:${item.path}`}
              draggable
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => dragging !== null && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null && dragging !== index) useFavoritesStore.getState().move(dragging, index);
                setDragging(null);
              }}
              onDragEnd={() => setDragging(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                useTreeUi.getState().openMenu(event.clientX, event.clientY, note ? { kind: "note", note } : { kind: "folder", path: item.path, name });
              }}
              className={cn(
                "group flex items-center rounded-md pr-1 text-sm hover:bg-accent/70",
                item.kind === "note" && item.path === activePath && "bg-accent font-medium text-accent-foreground",
                dragging === index && "opacity-50",
              )}
            >
              <button type="button" onClick={(event) => open(item, event)} title={item.path} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 text-left">
                {item.kind === "folder" ? <Folder className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{name}</span>
              </button>
              <button
                type="button"
                title="즐겨찾기에서 빼기"
                aria-label={`${name} 즐겨찾기에서 빼기`}
                onClick={() => useFavoritesStore.getState().toggle(item.kind, item.path)}
                className="hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:flex"
              >
                <StarOff className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
