import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Check, Copy, Trash2 } from "lucide-react";

import { shortcutLabel } from "@/shared/lib/shortcut";
import { ContextMenu, type MenuItem } from "@/shared/ui/context-menu";

import { BLOCK_TYPES, blockShortcut, CONVERTIBLE_BLOCKS } from "../lib/block-types";

export interface BlockTarget {
  /** 블록이 시작하는 문서 위치 */
  pos: number;
  node: ProseMirrorNode;
}

/** 블록 안의 글 전체를 선택한다 (목록이나 인용이면 모든 항목이 선택돼서 한꺼번에 바뀐다). */
export function selectBlock(editor: Editor, { pos, node }: BlockTarget) {
  editor
    .chain()
    .focus()
    .setTextSelection({ from: pos + 1, to: Math.max(pos + 1, pos + node.nodeSize - 1) })
    .run();
}

/**
 * 블록 왼쪽 손잡이(⋮⋮)를 눌렀을 때 뜨는 메뉴: 블록 종류 바꾸기, 복제, 삭제.
 * 메뉴를 열기 전에 selectBlock으로 그 블록을 선택해 두어야 지금 종류에 체크가 보인다.
 */
export function BlockMenu({ editor, target, x, y, onClose }: { editor: Editor; target: BlockTarget; x: number; y: number; onClose: () => void }) {
  const convertible = CONVERTIBLE_BLOCKS.has(target.node.type.name);
  const items: MenuItem[] = [];
  if (convertible) {
    for (const type of BLOCK_TYPES) {
      const current = type.is(editor);
      items.push({
        label: `${type.label}  ${shortcutLabel(blockShortcut(type))}`,
        icon: current ? <Check /> : <span className="size-4" />,
        onSelect: () => {
          selectBlock(editor, target);
          type.set(editor);
        },
      });
    }
    items.push("separator");
  }
  items.push(
    {
      label: "복제",
      icon: <Copy />,
      onSelect: () => void editor.chain().focus().insertContentAt(target.pos + target.node.nodeSize, target.node.toJSON()).run(),
    },
    {
      label: "삭제",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => void editor.chain().focus().deleteRange({ from: target.pos, to: target.pos + target.node.nodeSize }).run(),
    },
  );
  return <ContextMenu x={x} y={y} label="블록 메뉴" items={items} onClose={onClose} />;
}
