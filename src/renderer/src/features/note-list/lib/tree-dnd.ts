export type DragItem = { kind: "note" | "folder"; path: string };

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/**
 * 끌고 있는 글이나 폴더를 이 폴더("" 는 맨 위)에 놓을 수 있는지.
 * 지금 있는 폴더로는 옮길 게 없고, 폴더는 자기 자신이나 그 안으로 들어갈 수 없다.
 */
export function canDrop(item: DragItem, folder: string) {
  if (parentOf(item.path) === folder) return false;
  if (item.kind === "folder" && (folder === item.path || folder.startsWith(`${item.path}/`))) return false;
  return true;
}
