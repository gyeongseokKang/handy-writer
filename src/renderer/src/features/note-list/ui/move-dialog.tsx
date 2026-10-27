import { Folder, FolderRoot } from "lucide-react";
import { useMemo, useState } from "react";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";

import { useTreeUi } from "../model/use-tree-ui";

const ROOT_LABEL = "맨 위";

/** 글을 옮길 폴더를 고르는 창. 위아래 화살표와 Enter로도 고른다. */
export function MoveDialog() {
  const note = useTreeUi((s) => s.moving);
  const setMoving = useTreeUi((s) => s.setMoving);
  const folders = useWorkspaceStore((s) => s.folders);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ["", ...folders].filter((folder) => folder !== note?.folder && (!needle || (folder || ROOT_LABEL).toLowerCase().includes(needle)));
  }, [folders, note, query]);

  if (!note) return null;
  const close = () => {
    setMoving(null);
    setQuery("");
    setIndex(0);
  };
  const choose = (folder: string | undefined) => {
    if (folder === undefined) return;
    close();
    void useWorkspaceStore.getState().moveNote(note.path, folder);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setIndex((i) => (choices.length ? (i + step + choices.length) % choices.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(choices[index]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="옮길 폴더 고르기"
        className="w-full max-w-md overflow-hidden rounded-xl border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="border-b px-4 py-3">
          <p className="mb-2 truncate text-sm">
            <span className="text-muted-foreground">옮길 글 </span>
            {note.name}
          </p>
          <input
            autoFocus
            value={query}
            aria-label="폴더 찾기"
            placeholder="폴더 이름으로 찾기"
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            className="h-8 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <ul role="listbox" aria-label="폴더" className="max-h-72 overflow-y-auto p-1">
          {choices.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">맞는 폴더가 없어요</li>
          ) : (
            choices.map((folder, i) => (
              <li key={folder || "/"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(folder)}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm", i === index && "bg-accent")}
                >
                  {folder ? <Folder className="size-4 shrink-0 text-muted-foreground" /> : <FolderRoot className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{folder || ROOT_LABEL}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
