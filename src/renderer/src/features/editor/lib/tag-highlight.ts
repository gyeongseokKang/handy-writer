import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createInlineTagRegex } from "@shared/note-parser";

export interface TagHighlightOptions {
  onTagClick: (tag: string) => void;
}

const LEAF = "￼";

/** 본문의 `#태그`를 칩처럼 보여주고 누르면 태그 목록으로 보낸다. 문서 내용은 바꾸지 않는다. */
export const TagHighlight = Extension.create<TagHighlightOptions>({
  name: "tagHighlight",

  addOptions() {
    return { onTagClick: () => {} };
  },

  addProseMirrorPlugins() {
    const { options } = this;
    return [
      new Plugin({
        key: new PluginKey("tagHighlight"),
        props: {
          decorations: ({ doc }) => {
            const decorations: Decoration[] = [];
            const codeMark = doc.type.schema.marks["code"];
            doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              if (node.type.spec.code) return false;
              // 위키링크 같은 inline 노드는 한 글자로 바꿔서 글자 위치와 문서 위치를 맞춘다.
              const text = node.textBetween(0, node.content.size, undefined, LEAF);
              for (const match of text.matchAll(createInlineTagRegex())) {
                const from = pos + 1 + match.index;
                const to = from + match[0].length;
                if (codeMark && doc.rangeHasMark(from, to, codeMark)) continue;
                decorations.push(Decoration.inline(from, to, { class: "note-tag", "data-tag": match[1] ?? "" }));
              }
              return false;
            });
            return DecorationSet.create(doc, decorations);
          },
          handleDOMEvents: {
            click: (_view, event) => {
              const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tag]");
              if (!el) return false;
              options.onTagClick(el.dataset["tag"] ?? "");
              return true;
            },
          },
        },
      }),
    ];
  },
});
