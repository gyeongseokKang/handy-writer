import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isTitleHeading } from "@shared/title-heading";

export interface TitleEchoOptions {
  /** 지금 글 제목 (파일 이름) */
  getTitle: () => string;
}

/** 글 제목이 바뀐 뒤 다시 계산하라고 알리는 트랜잭션 메타 */
export const TITLE_ECHO_REFRESH = "refreshTitleEcho";

/** 본문 맨 앞의 제목(#)이 글 제목과 같아서 위쪽 제목이 대신하는 줄인지 */
export function isTitleEcho(node: ProseMirrorNode | null | undefined, title: string) {
  return !!node && node.type.name === "heading" && isTitleHeading(node.textContent, title);
}

/** 문서 맨 앞에 숨겨진 제목 줄이 차지하는 크기 (없으면 0). 본문의 첫 자리는 이 크기 +1이다. */
export function titleEchoSize(doc: ProseMirrorNode, title: string) {
  return isTitleEcho(doc.firstChild, title) ? doc.firstChild!.nodeSize : 0;
}

/**
 * 본문 맨 앞의 제목(#)이 글 제목과 같으면 화면에서 숨긴다. 위쪽 제목이 그 자리를 대신해서 제목이 두 번 보이지 않게 하려는 것으로,
 * 파일 내용은 바꾸지 않는다 (Obsidian 등에서는 그대로 보인다). 글 제목을 바꾸면 그 줄도 같이 바뀐다.
 * 숨긴 줄 쪽으로 커서가 가거나 글이 합쳐지지 않게, 그 줄 바로 아래에서 Backspace를 막고 아래에 빈 문단을 하나 둔다.
 */
export const TitleEcho = Extension.create<TitleEchoOptions>({
  name: "titleEcho",

  addOptions() {
    return { getTitle: () => "" };
  },

  addProseMirrorPlugins() {
    const { options } = this;
    return [
      new Plugin({
        key: new PluginKey("titleEcho"),
        props: {
          decorations: ({ doc }) => {
            const first = doc.firstChild;
            if (!isTitleEcho(first, options.getTitle())) return null;
            return DecorationSet.create(doc, [Decoration.node(0, first!.nodeSize, { class: "title-echo" })]);
          },
          handleKeyDown: (view, event) => {
            if (event.key !== "Backspace") return false;
            const { selection, doc } = view.state;
            const { $from } = selection;
            // 숨긴 제목 줄 바로 아래 첫 블록의 맨 앞에서는 앞 줄과 합치지 않는다.
            return selection.empty && $from.depth === 1 && $from.parentOffset === 0 && $from.index(0) === 1 && isTitleEcho(doc.firstChild, options.getTitle()) && $from.before(1) === doc.firstChild!.nodeSize;
          },
        },
        // 숨긴 제목 줄밖에 없으면 클릭하거나 쓸 자리가 없으므로 빈 문단을 하나 둔다 (저장·실행 취소 기록에는 남기지 않는다).
        appendTransaction: (_transactions, _old, state) => {
          const { doc, schema } = state;
          if (doc.childCount !== 1 || !isTitleEcho(doc.firstChild, options.getTitle())) return null;
          return state.tr.insert(doc.content.size, schema.nodes["paragraph"]!.create()).setMeta("addToHistory", false).setMeta("preventUpdate", true);
        },
      }),
    ];
  },
});
