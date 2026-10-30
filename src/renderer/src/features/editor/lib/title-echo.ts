import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface TitleEchoOptions {
  /** 지금 글 제목 (파일 이름) */
  getTitle: () => string;
}

/** 글 제목이 바뀐 뒤 다시 계산하라고 알리는 트랜잭션 메타 */
export const TITLE_ECHO_REFRESH = "refreshTitleEcho";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * 본문 맨 앞의 제목(#)이 글 제목과 같으면 흐리게 줄여 보여 준다. 제목이 두 번 크게 보이지 않게 하려는 것으로,
 * 파일 내용은 바꾸지 않는다 (Obsidian 등에서는 그대로 보인다).
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
            const title = normalize(options.getTitle());
            if (!first || first.type.name !== "heading" || !title || normalize(first.textContent) !== title) return null;
            return DecorationSet.create(doc, [Decoration.node(0, first.nodeSize, { class: "title-echo", title: "글 제목과 같은 제목이라 작게 보여요 (파일은 그대로예요)" })]);
          },
        },
      }),
    ];
  },
});
