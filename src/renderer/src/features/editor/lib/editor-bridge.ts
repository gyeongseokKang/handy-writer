import type { Editor, JSONContent } from "@tiptap/core";

import type { ApplyResult, EditorBridge, EditorContext } from "@/entities/note/model/use-editor-bridge";

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

    insertBelowCursor(markdown) {
      const { $to } = editor.state.selection;
      const pos = $to.depth > 0 ? $to.after($to.depth) : $to.pos;
      editor.chain().focus().insertContentAt(pos, markdown, { contentType: "markdown" }).run();
    },
  };
}
