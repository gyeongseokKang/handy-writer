import { Columns2, Copy, FilePlus2, History, PanelTop, FolderInput, FolderOpen, FolderPlus, Link2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { ContextMenu, type MenuItem } from "@/shared/ui/context-menu";

import { useTreeUi, type TreeTarget } from "../model/use-tree-ui";

function copy(text: string, what: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${what}를 복사했어요.`))
    .catch(() => toast.error(`${what}를 복사하지 못했어요.`));
}

async function newFolder(parent: string) {
  const path = await useWorkspaceStore.getState().createFolder(parent);
  if (path) useTreeUi.getState().startRename("folder", path);
}

function itemsFor(target: TreeTarget): MenuItem[] {
  const ws = useWorkspaceStore.getState();
  const ui = useTreeUi.getState();

  if (target.kind === "root") {
    return [
      { label: "새 글", icon: <FilePlus2 />, onSelect: () => void ws.createNote("") },
      { label: "새 폴더", icon: <FolderPlus />, onSelect: () => void newFolder("") },
    ];
  }

  if (target.kind === "folder") {
    const count = ws.notes.filter((note) => note.path.startsWith(`${target.path}/`)).length;
    return [
      { label: "새 글", icon: <FilePlus2 />, onSelect: () => void ws.createNote(target.path) },
      { label: "새 폴더", icon: <FolderPlus />, onSelect: () => void newFolder(target.path) },
      "separator",
      { label: "이름 바꾸기", icon: <Pencil />, onSelect: () => ui.startRename("folder", target.path) },
      { label: "Finder에서 보기", icon: <FolderOpen />, onSelect: () => void api.notes.reveal(target.path) },
      "separator",
      {
        label: "휴지통으로 이동",
        icon: <Trash2 />,
        danger: true,
        onSelect: () => {
          const detail = count > 0 ? `와 안에 있는 글 ${count}개를` : "를";
          if (window.confirm(`“${target.name}” 폴더${detail} 휴지통으로 옮길까요?`)) void ws.removeFolder(target.path);
        },
      },
    ];
  }

  const { note } = target;
  return [
    { label: "새 탭에서 열기", icon: <PanelTop />, onSelect: () => void ws.openNote(note.path, { newTab: true }) },
    { label: "옆에 열기", icon: <Columns2 />, disabled: note.path === ws.activePath, onSelect: () => void ws.openSplit(note.path) },
    "separator",
    { label: "이름 바꾸기", icon: <Pencil />, onSelect: () => ui.startRename("note", note.path) },
    { label: "복제", icon: <Copy />, onSelect: () => void ws.duplicateNote(note.path) },
    { label: "다른 폴더로 옮기기…", icon: <FolderInput />, onSelect: () => ui.setMoving(note) },
    { label: "변경 기록", icon: <History />, onSelect: () => useUiStore.getState().setHistoryTarget({ path: note.path, name: note.name }) },
    "separator",
    { label: "링크 복사", icon: <Link2 />, onSelect: () => copy(`[[${note.name}]]`, "링크") },
    { label: "경로 복사", icon: <Copy />, onSelect: () => copy(note.path, "경로") },
    { label: "Finder에서 보기", icon: <FolderOpen />, onSelect: () => void api.notes.reveal(note.path) },
    "separator",
    {
      label: "휴지통으로 이동",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => {
        if (window.confirm(`“${note.name}” 글을 휴지통으로 옮길까요?`)) void ws.removeNote(note.path);
      },
    },
  ];
}

const MENU_LABEL: Record<TreeTarget["kind"], string> = { note: "글 메뉴", folder: "폴더 메뉴", root: "글 목록 메뉴" };

/** 글 목록의 우클릭 메뉴 */
export function TreeMenu() {
  const menu = useTreeUi((s) => s.menu);
  const closeMenu = useTreeUi((s) => s.closeMenu);
  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} label={MENU_LABEL[menu.target.kind]} items={itemsFor(menu.target)} onClose={closeMenu} />;
}
