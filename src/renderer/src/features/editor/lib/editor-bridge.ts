import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ApplyResult, EditorBridge, EditorContext, EmbedItem } from "@/entities/note/model/use-editor-bridge";

function serialize(editor: Editor, from: number, to: number) {
  const content = editor.state.doc.slice(from, to).content.toJSON() as JSONContent[];
  return editor.markdown?.serialize({ type: "doc", content }).trim() ?? "";
}

/** 마크다운이 문단 하나로만 이루어졌으면 그 문단의 inline 내용을 돌려준다. */
function singleParagraphContent(editor: Editor, markdown: string): JSONContent[] | null {
  const doc = editor.markdown?.parse(markdown);
  const blocks = doc?.content ?? [];
  const only = blocks.length === 1 ? blocks[0] : undefined;
  return only?.type === "paragraph" && only.content ? only.content : null;
}

function findEmbed(editor: Editor, uid: string) {
  let found: { pos: number; node: ProseMirrorNode } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "embed" && node.attrs["uid"] === uid) found = { pos, node };
    return !found;
  });
  return found as { pos: number; node: ProseMirrorNode } | null;
}

export function createEditorBridge(editor: Editor, getNoteName: () => string): EditorBridge {
  const docEnd = () => editor.state.doc.content.size;

  return {
    getContext(): EditorContext {
      const { from, to, empty } = editor.state.selection;
      const range = empty ? { from: 0, to: docEnd() } : { from, to };
      return {
        noteName: getNoteName(),
        hasSelection: !empty,
        text: serialize(editor, range.from, range.to),
        before: serialize(editor, 0, from),
        from: range.from,
        to: range.to,
      };
    },

    replace(context, markdown): ApplyResult {
      if (context.to > docEnd() || serialize(editor, context.from, context.to) !== context.text) return "changed";
      const wholeNote = !context.hasSelection;
      if (wholeNote) {
        editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: true });
      } else {
        const range = { from: context.from, to: context.to };
        const $from = editor.state.doc.resolve(range.from);
        const $to = editor.state.doc.resolve(range.to);
        const inline = $from.sameParent($to) && $from.parent.isTextblock ? singleParagraphContent(editor, markdown) : null;
        // 한 문단 안의 일부만 고른 경우에는 문단을 쪼개지 않고 글자만 바꿔 넣는다.
        if (inline) editor.chain().focus().insertContentAt(range, inline).run();
        else editor.chain().focus().insertContentAt(range, markdown, { contentType: "markdown" }).run();
      }
      return "ok";
    },

    listEmbeds() {
      const items: EmbedItem[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name !== "embed") return true;
        const a = node.attrs;
        items.push({ uid: a["uid"], target: a["target"], label: a["label"], width: a["width"], height: a["height"], syntax: a["syntax"] });
        return false;
      });
      return items;
    },

    updateEmbed(uid, patch) {
      const found = findEmbed(editor, uid);
      if (!found) return false;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, ...patch }));
      return true;
    },

    removeEmbed(uid) {
      const found = findEmbed(editor, uid);
      if (!found) return false;
      const { doc } = editor.state;
      const $pos = doc.resolve(found.pos);
      // 문단에 임베드만 있었으면 빈 문단이 남지 않도록 문단째 지운다.
      const onlyChild = $pos.parent.type.name === "paragraph" && $pos.parent.childCount === 1 && doc.childCount > 1;
      const from = onlyChild ? $pos.before() : found.pos;
      const to = onlyChild ? $pos.after() : found.pos + found.node.nodeSize;
      editor.view.dispatch(editor.state.tr.delete(from, to));
      return true;
    },

    focusEmbed(uid) {
      const found = findEmbed(editor, uid);
      if (!found) return false;
      editor.chain().focus().setNodeSelection(found.pos).scrollIntoView().run();
      return true;
    },

    insertEmbeds(targets, pos) {
      if (targets.length === 0) return;
      const nodes = targets.map((target) => ({ type: "paragraph", content: [{ type: "embed", attrs: { target, syntax: "wiki" } }] }));
      const chain = editor.chain().focus();
      (pos === undefined ? chain.insertContent(nodes) : chain.insertContentAt(pos, nodes)).run();
    },

    findAndSelect(term) {
      const needle = term.trim().toLowerCase();
      if (!needle) return false;
      let found: { from: number; to: number } | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (found) return false;
        if (!node.isTextblock) return true;
        // 위키링크 같은 inline 노드는 한 글자로 바꿔서 글자 위치와 문서 위치를 맞춘다.
        const index = node.textBetween(0, node.content.size, undefined, "\uFFFC").toLowerCase().indexOf(needle);
        if (index >= 0) found = { from: pos + 1 + index, to: pos + 1 + index + needle.length };
        return false;
      });
      if (!found) return false;
      editor.chain().focus().setTextSelection(found).scrollIntoView().run();
      return true;
    },

    insertBelowCursor(markdown) {
      const { $to } = editor.state.selection;
      const pos = $to.depth > 0 ? $to.after($to.depth) : $to.pos;
      editor.chain().focus().insertContentAt(pos, markdown, { contentType: "markdown" }).run();
    },
  };
}
