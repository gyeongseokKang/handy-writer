import { Extension, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/** 지금 선택이 든 최상위 블록 (목록이나 인용이면 그 전체) */
function currentBlock(editor: Editor) {
  const { state } = editor;
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const index = $from.index(0);
  return { index, node: state.doc.child(index), pos: $from.before(1) };
}

/** 블록을 위(-1)나 아래(1)로 한 칸 옮긴다. 선택은 그 블록 안의 같은 자리에 둔다. 옮길 수 없으면 false */
export function moveBlock(editor: Editor, direction: -1 | 1) {
  const block = currentBlock(editor);
  if (!block) return false;
  const { state, view } = editor;
  const { doc, selection } = state;
  const neighbor = doc.maybeChild(block.index + direction);
  if (!neighbor) return true; // 맨 위·맨 아래면 그대로 둔다 (키는 쓴 것으로 친다)
  // 글 제목과 같아서 숨겨진 맨 앞 제목 줄(title-echo) 위로는 올리지 않는다.
  if (direction === -1 && block.index === 1 && (view.dom.firstElementChild as HTMLElement | null)?.classList.contains("title-echo")) return true;

  const start = direction === -1 ? block.pos - neighbor.nodeSize : block.pos + neighbor.nodeSize;
  const tr = state.tr.delete(block.pos, block.pos + block.node.nodeSize);
  // 지운 뒤에는 아래 이웃이 이 블록 자리로 올라와 있다.
  tr.insert(direction === -1 ? start : block.pos + neighbor.nodeSize, block.node);
  const shift = start - block.pos;
  tr.setSelection(TextSelection.create(tr.doc, selection.anchor + shift, selection.head + shift)).scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** 블록을 바로 아래에 하나 더 만들고 선택을 그 복사본으로 옮긴다. */
export function duplicateBlock(editor: Editor) {
  const block = currentBlock(editor);
  if (!block) return false;
  const { selection } = editor.state;
  const at = block.pos + block.node.nodeSize;
  const shift = block.node.nodeSize;
  return editor
    .chain()
    .insertContentAt(at, block.node.toJSON())
    .setTextSelection({ from: selection.anchor + shift, to: selection.head + shift })
    .scrollIntoView()
    .run();
}

/**
 * 블록 편집기의 기본 단축키: `Ctrl/Cmd+Shift+↑/↓` 블록을 위·아래로 옮기기, `Ctrl/Cmd+D` 블록 복제 (Notion과 같다).
 * 글 제목 줄(숨김)이나 코드 블록 안에서도 블록 단위로 움직인다.
 */
export const BlockMoves = Extension.create({
  name: "blockMoves",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-ArrowUp": () => moveBlock(this.editor, -1),
      "Mod-Shift-ArrowDown": () => moveBlock(this.editor, 1),
      "Mod-d": () => duplicateBlock(this.editor),
    };
  },
});
