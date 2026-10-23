import type { NoteMeta } from "@shared/types";
import { ChevronRight, FileText, FolderPlus, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { useGitStore } from "@/entities/git/model/use-git-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";

interface FolderNode {
  path: string;
  name: string;
  folders: FolderNode[];
  notes: NoteMeta[];
}

function buildTree(notes: NoteMeta[]): FolderNode {
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

  for (const note of notes) ensure(note.folder).notes.push(note);

  const sort = (node: FolderNode) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    node.notes.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function NoteRow({ note, depth }: { note: NoteMeta; depth: number }) {
  const active = useWorkspaceStore((state) => state.activePath === note.path);
  const openNote = useWorkspaceStore((state) => state.openNote);
  const removeNote = useWorkspaceStore((state) => state.removeNote);
  const changeKind = useGitStore((state) => state.changedByPath[note.path]);

  return (
    <div
      className={cn(
        "group flex items-center rounded-md pr-1 text-sm hover:bg-accent/70",
        active && "bg-accent font-medium text-accent-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => void openNote(note.path)}
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

  return (
    <div>
      <div className="group flex items-center rounded-md pr-1 text-sm text-muted-foreground hover:bg-accent/70">
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
      {open && <TreeChildren node={folder} depth={depth + 1} forceOpen={forceOpen} />}
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
  const query = useWorkspaceStore((state) => state.query);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? notes.filter((note) => note.path.toLowerCase().includes(needle)) : notes;
  }, [notes, query]);
  const tree = useMemo(() => buildTree(filtered), [filtered]);

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {query.trim() ? "검색 결과가 없어요" : "아직 글이 없어요"}
      </p>
    );
  }

  return (
    <nav aria-label="글 목록" className="flex flex-col gap-px px-2 pb-4">
      <TreeChildren node={tree} depth={0} forceOpen={query.trim() !== ""} />
    </nav>
  );
}
