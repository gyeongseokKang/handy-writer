import type { NoteMeta } from "@shared/types";
import { create } from "zustand";

/** 우클릭한 대상: 글, 폴더, 또는 목록의 빈 곳(작업 폴더 맨 위) */
export type TreeTarget = { kind: "note"; note: NoteMeta } | { kind: "folder"; path: string; name: string } | { kind: "root" };

interface TreeUiState {
  menu: { x: number; y: number; target: TreeTarget } | null;
  /** 이름을 고치는 중인 글이나 폴더 */
  renaming: { kind: "note" | "folder"; path: string } | null;
  /** 다른 폴더로 옮길 글 */
  moving: NoteMeta | null;
  /** 끌고 있는 글이나 폴더 */
  drag: { kind: "note" | "folder"; path: string } | null;
  /** 놓으면 들어갈 폴더 ("" 는 맨 위) */
  dropTarget: string | null;
  setDrag: (drag: TreeUiState["drag"]) => void;
  setDropTarget: (folder: string | null) => void;
  openMenu: (x: number, y: number, target: TreeTarget) => void;
  closeMenu: () => void;
  startRename: (kind: "note" | "folder", path: string) => void;
  stopRename: () => void;
  setMoving: (note: NoteMeta | null) => void;
}

export const useTreeUi = create<TreeUiState>((set) => ({
  menu: null,
  renaming: null,
  moving: null,
  drag: null,
  dropTarget: null,
  setDrag: (drag) => set({ drag, dropTarget: null }),
  setDropTarget: (dropTarget) => set((state) => (state.dropTarget === dropTarget ? state : { dropTarget })),
  openMenu: (x, y, target) => set({ menu: { x, y, target } }),
  closeMenu: () => set({ menu: null }),
  startRename: (kind, path) => set({ renaming: { kind, path }, menu: null }),
  stopRename: () => set({ renaming: null }),
  setMoving: (moving) => set({ moving, menu: null }),
}));
