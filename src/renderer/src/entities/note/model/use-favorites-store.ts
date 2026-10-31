import { create } from "zustand";

/** 사이드바 맨 위에 고정한 글이나 폴더 */
export interface Favorite {
  kind: "note" | "folder";
  /** 작업 폴더 기준 상대 경로 */
  path: string;
}

const KEY_PREFIX = "handy-writer:favorites:";

function read(root: string): Favorite[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY_PREFIX + root) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is Favorite =>
        !!item && typeof item === "object" && (item.kind === "note" || item.kind === "folder") && typeof item.path === "string",
    );
  } catch {
    return [];
  }
}

function save(root: string | null, items: Favorite[]) {
  if (!root) return;
  try {
    localStorage.setItem(KEY_PREFIX + root, JSON.stringify(items));
  } catch {
    // 저장소를 못 써도 앱은 동작해야 한다.
  }
}

interface FavoritesState {
  root: string | null;
  items: Favorite[];
  /** 작업 폴더가 바뀌면 그 폴더의 즐겨찾기를 읽는다 (작업 폴더마다, 이 컴퓨터에만 저장). */
  load: (root: string | null) => void;
  has: (kind: Favorite["kind"], path: string) => boolean;
  toggle: (kind: Favorite["kind"], path: string) => void;
  /** 끌어서 순서를 바꾼다. */
  move: (from: number, to: number) => void;
  /** 글·폴더를 옮기거나 이름을 바꾸면 경로를 따라 고친다. null이면 뺀다. */
  remap: (map: (path: string) => string | null) => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => {
  const update = (items: Favorite[]) => {
    save(get().root, items);
    set({ items });
  };
  return {
    root: null,
    items: [],
    load: (root) => set({ root, items: root ? read(root) : [] }),
    has: (kind, path) => get().items.some((item) => item.kind === kind && item.path === path),
    toggle: (kind, path) => {
      const { items } = get();
      const exists = items.some((item) => item.kind === kind && item.path === path);
      update(exists ? items.filter((item) => !(item.kind === kind && item.path === path)) : [...items, { kind, path }]);
    },
    move: (from, to) => {
      const items = [...get().items];
      const [item] = items.splice(from, 1);
      if (!item) return;
      items.splice(Math.max(0, Math.min(to, items.length)), 0, item);
      update(items);
    },
    remap: (map) => {
      const { items } = get();
      const next = items.flatMap((item) => {
        const path = map(item.path);
        return path === null ? [] : [{ ...item, path }];
      });
      if (next.some((item, i) => item.path !== items[i]?.path) || next.length !== items.length) update(next);
    },
  };
});
