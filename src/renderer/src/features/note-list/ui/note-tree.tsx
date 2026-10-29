import type { NoteMeta } from "@shared/types";
import { ChevronRight, FileText, FolderPlus, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";

import { useGitStore } from "@/entities/git/model/use-git-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";

import { useTreeUi, type TreeTarget } from "../model/use-tree-ui";
import { MoveDialog } from "./move-dialog";
import { TreeMenu } from "./tree-menu";

interface FolderNode {
  path: string;
  name: string;
  folders: FolderNode[];
  notes: NoteMeta[];
}

/** 글과 폴더 목록으로 트리를 만든다. 글이 없는 폴더도 보인다. */
export function buildTree(notes: NoteMeta[], folderPaths: string[] = []): FolderNode {
  const root: FolderNode = { path: "", name: "", folders: [], notes: [] };
  const folders = new Map<string, FolderNode>([["", root]]);

  const ensure = (path: string): FolderNode => {
    const found = folders.get(path);
    if (found) return found;
    const slash = path.lastIndexOf("/");
    const node: FolderNode = { path, name: path.slice(slash + 1), folders: [], notes: [] };
    folders.set(path, node);
    ensure(slash === -1 ? "" : path.slice(0, slash)).folders.push(node);
    return node;
  };

  for (const folder of folderPaths) ensure(folder);
  for (const note of notes) ensure(note.folder).notes.push(note);

  const sort = (node: FolderNode) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    node.notes.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** 우클릭 메뉴를 연다. 브라우저 기본 메뉴와 바깥(빈 곳) 메뉴는 막는다. */
const onContextMenu = (target: TreeTarget) => (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  useTreeUi.getState().openMenu(event.clientX, event.clientY, target);
};

/** 목록 안에서 바로 이름을 고친다. Enter·포커스를 잃으면 저장, Esc는 취소 */
function RenameInput({ initial, label, depth, onSubmit }: { initial: string; label: string; depth: number; onSubmit: (name: string) => Promise<unknown> }) {
  const stopRename = useTreeUi((s) => s.stopRename);
  const done = useRef(false);
  const finish = (save: boolean, value: string) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (!save || !name || name === initial) return stopRename();
    void onSubmit(name).finally(stopRename);
  };
  return (
    <div className="py-0.5 pr-1" style={{ paddingLeft: 4 + depth * 14 }}>
      <input
        autoFocus
        defaultValue={initial}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => finish(true, event.currentTarget.value)}
        onKeyDown={(event) => {
          // 한글 조합 중의 Enter는 글자를 확정하는 것이라 저장하지 않는다.
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") finish(true, event.currentTarget.value);
          else if (event.key === "Escape") finish(false, "");
        }}
        className="h-7 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>
  );
}

function NoteRow({ note, depth }: { note: NoteMeta; depth: number }) {
  const active = useWorkspaceStore((state) => state.activePath === note.path);
  const openNote = useWorkspaceStore((state) => state.openNote);
  const removeNote = useWorkspaceStore((state) => state.removeNote);
  const changeKind = useGitStore((state) => state.changedByPath[note.path]);
  const renaming = useTreeUi((s) => s.renaming?.kind === "note" && s.renaming.path === note.path);

  if (renaming) {
    return <RenameInput initial={note.name} label={`${note.name} 새 이름`} depth={depth} onSubmit={(name) => useWorkspaceStore.getState().renameNote(note.path, name)} />;
  }

  return (
    <div
      onContextMenu={onContextMenu({ kind: "note", note })}
      className={cn(
        "group flex items-center rounded-md pr-1 text-sm hover:bg-accent/70",
        active && "bg-accent font-medium text-accent-foreground",
      )}
    >
      <button
        type="button"
        // Cmd/Ctrl+클릭(또는 가운데 버튼)은 새 탭, Alt+클릭은 오른쪽에 나란히 연다.
        onClick={(event) => {
          if (event.altKey) void useWorkspaceStore.getState().openSplit(note.path);
          else void openNote(note.path, { newTab: event.metaKey || event.ctrlKey });
        }}
        onAuxClick={(event) => event.button === 1 && void openNote(note.path, { newTab: true })}
        title={`${note.path}\nCmd/Ctrl+클릭: 새 탭 · Alt+클릭: 옆에 열기`}
        style={{ paddingLeft: 8 + depth * 14 }}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{note.name}</span>
        {changeKind && (
          <span
            role="img"
            aria-label="git 변경됨"
            title="커밋하지 않은 변경이 있어요"
            className={cn("ml-auto size-1.5 shrink-0 rounded-full", changeKind === "untracked" || changeKind === "added" ? "bg-emerald-500" : "bg-amber-500")}
          />
        )}
      </button>
      <button
        type="button"
        title="휴지통으로 이동"
        aria-label={`${note.name} 삭제`}
        onClick={() => {
          if (window.confirm(`“${note.name}” 글을 휴지통으로 옮길까요?`)) void removeNote(note.path);
        }}
        className="hidden size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover:flex"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function FolderRow({ folder, depth, forceOpen }: { folder: FolderNode; depth: number; forceOpen: boolean }) {
  const collapsed = useWorkspaceStore((state) => state.collapsedFolders[folder.path] ?? false);
  const toggleFolder = useWorkspaceStore((state) => state.toggleFolder);
  const createNote = useWorkspaceStore((state) => state.createNote);
  const open = forceOpen || !collapsed;
  const renaming = useTreeUi((s) => s.renaming?.kind === "folder" && s.renaming.path === folder.path);

  return (
    <div>
      {renaming ? (
        <RenameInput initial={folder.name} label={`${folder.name} 폴더 새 이름`} depth={depth} onSubmit={(name) => useWorkspaceStore.getState().renameFolder(folder.path, name)} />
      ) : (
        <div
          onContextMenu={onContextMenu({ kind: "folder", path: folder.path, name: folder.name })}
          className="group flex items-center rounded-md pr-1 text-sm text-muted-foreground hover:bg-accent/70"
        >
          <button
            type="button"
            onClick={() => toggleFolder(folder.path)}
            style={{ paddingLeft: 4 + depth * 14 }}
            className="flex min-w-0 flex-1 items-center gap-1 py-1.5 text-left"
            aria-expanded={open}
          >
            <ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} />
            <span className="truncate">{folder.name}</span>
          </button>
          <button
            type="button"
            title="이 폴더에 새 글"
            aria-label={`${folder.name} 폴더에 새 글`}
            onClick={() => void createNote(folder.path)}
            className="hidden size-6 shrink-0 items-center justify-center rounded hover:text-foreground group-hover:flex"
          >
            <FolderPlus className="size-3.5" />
          </button>
        </div>
      )}
      {open &&
        (folder.folders.length === 0 && folder.notes.length === 0 ? (
          // 빈 폴더를 펼쳤을 때 아래 글이 이 폴더 안에 있는 것처럼 보이지 않게 한다.
          <p className="py-1 text-xs text-muted-foreground/70" style={{ paddingLeft: 26 + depth * 14 }}>
            비어 있음
          </p>
        ) : (
          <TreeChildren node={folder} depth={depth + 1} forceOpen={forceOpen} />
        ))}
    </div>
  );
}

function TreeChildren({ node, depth, forceOpen }: { node: FolderNode; depth: number; forceOpen: boolean }) {
  return (
    <>
      {node.folders.map((folder) => (
        <FolderRow key={folder.path} folder={folder} depth={depth} forceOpen={forceOpen} />
      ))}
      {node.notes.map((note) => (
        <NoteRow key={note.path} note={note} depth={depth} />
      ))}
    </>
  );
}

export function NoteTree() {
  const notes = useWorkspaceStore((state) => state.notes);
  const folders = useWorkspaceStore((state) => state.folders);
  const query = useWorkspaceStore((state) => state.query);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => (needle ? notes.filter((note) => note.path.toLowerCase().includes(needle)) : notes), [notes, needle]);
  // 찾는 중에는 맞는 글이 든 폴더만 보이게, 빈 폴더는 뺀다.
  const tree = useMemo(() => buildTree(filtered, needle ? [] : folders), [filtered, folders, needle]);

  return (
    // 빈 곳을 우클릭하면 맨 위에 새 글·새 폴더를 만드는 메뉴가 뜬다.
    <div className="min-h-full pb-4" onContextMenu={onContextMenu({ kind: "root" })}>
      {tree.folders.length === 0 && tree.notes.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">{needle ? "검색 결과가 없어요" : "아직 글이 없어요"}</p>
      ) : (
        <nav aria-label="글 목록" className="flex flex-col gap-px px-2">
          <TreeChildren node={tree} depth={0} forceOpen={needle !== ""} />
        </nav>
      )}
      <TreeMenu />
      <MoveDialog />
    </div>
  );
}
