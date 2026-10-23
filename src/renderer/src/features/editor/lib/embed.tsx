import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  decodeMarkdownTarget,
  formatEmbed,
  parseEmbedParams,
  type EmbedAttrs,
} from "@shared/attachments";

import { EmbedView } from "../ui/embed-view";

export interface EmbedOptions {
  /** false면 화면용 NodeView를 만들지 않는다 (React 없이 문서만 다루는 테스트용) */
  renderView: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      insertEmbed: (attrs: Partial<EmbedAttrs>) => ReturnType;
    };
  }
}

/** 모든 임베드가 서로 다른 uid를 갖게 하는 트랜잭션을 만든다. 이미 그렇다면 null */
function assignUids(state: EditorState) {
  const seen = new Set<string>();
  let tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "embed") return true;
    const uid = node.attrs["uid"] as string | null;
    if (!uid || seen.has(uid)) tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, uid: crypto.randomUUID() });
    else seen.add(uid);
    return false;
  });
  return tr.docChanged ? tr.setMeta("addToHistory", false).setMeta("preventUpdate", true) : null;
}

const WIKI_EMBED = /^!\[\[([^\]\n]+?)\]\]/;
const MARKDOWN_IMAGE = /^!\[([^\]\n]*)\]\((<[^>\n]+>|[^)\s\n]+)(?:\s+"([^"\n]*)")?\)/;

/**
 * 이미지, 영상, 오디오, PDF 임베드. Obsidian의 `![[파일.png|라벨|300]]`과
 * 일반 마크다운의 `![라벨|300](경로)`를 읽고, 읽은 문법 그대로 다시 쓴다.
 */
export const Embed = Node.create<EmbedOptions>({
  name: "embed",
  // `![[…]]` 입력 규칙이 위키링크의 `[[…]]` 규칙보다 먼저 적용되도록 우선순위를 높인다.
  priority: 1000,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { renderView: true };
  },

  addAttributes() {
    return {
      // 패널에서 임베드를 가리키기 위한 임시 ID. 마크다운에는 쓰지 않는다.
      uid: { default: null, rendered: false, parseHTML: () => crypto.randomUUID() },
      target: { default: "", parseHTML: (el) => el.getAttribute("data-embed") ?? "" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") ?? "" },
      width: { default: null, parseHTML: (el) => Number(el.getAttribute("data-width")) || null },
      height: { default: null, parseHTML: (el) => Number(el.getAttribute("data-height")) || null },
      syntax: { default: "wiki", parseHTML: (el) => (el.getAttribute("data-syntax") === "markdown" ? "markdown" : "wiki") },
      title: { default: "", parseHTML: (el) => el.getAttribute("data-title") ?? "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-embed]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs as EmbedAttrs;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-embed": a.target,
        "data-label": a.label,
        "data-width": a.width ?? "",
        "data-height": a.height ?? "",
        "data-syntax": a.syntax,
        "data-title": a.title,
      }),
      a.label || a.target,
    ];
  },

  renderText({ node }) {
    return formatEmbed(node.attrs as EmbedAttrs);
  },

  markdownTokenizer: {
    name: "embed",
    level: "inline",
    start: (src) => src.indexOf("!["),
    tokenize(src) {
      const wiki = WIKI_EMBED.exec(src);
      if (wiki) {
        const [target = "", ...rest] = (wiki[1] ?? "").split("|");
        return { type: "embed", raw: wiki[0], target: target.trim(), syntax: "wiki", title: "", ...parseEmbedParams(rest) };
      }
      const image = MARKDOWN_IMAGE.exec(src);
      if (image) {
        return {
          type: "embed",
          raw: image[0],
          target: decodeMarkdownTarget(image[2] ?? ""),
          syntax: "markdown",
          title: image[3] ?? "",
          ...parseEmbedParams((image[1] ?? "").split("|")),
        };
      }
      return undefined;
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("embed", {
      // 생성자에 넘긴 초기 내용에는 appendTransaction이 돌지 않으므로, 읽을 때 바로 부여한다.
      uid: crypto.randomUUID(),
      target: token.target,
      label: token.label ?? "",
      width: token.width ?? null,
      height: token.height ?? null,
      syntax: token.syntax,
      title: token.title ?? "",
    }),

  renderMarkdown: (node) => formatEmbed(node.attrs as EmbedAttrs),

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: /!\[\[([^\]\n]+?)\]\]$/,
        handler: ({ state, range, match }) => {
          const [target = "", ...rest] = (match[1] ?? "").split("|");
          state.tr.replaceWith(range.from, range.to, type.create({ target: target.trim(), syntax: "wiki", ...parseEmbedParams(rest) }));
        },
      }),
    ];
  },

  addNodeView() {
    return this.options.renderView ? ReactNodeViewRenderer(EmbedView) : null;
  },

  addProseMirrorPlugins() {
    return [
      // 읽은 직후, 붙여넣을 때, 복사했을 때 모두 임베드마다 서로 다른 uid를 갖게 한다.
      new Plugin({
        key: new PluginKey("embedUid"),
        appendTransaction: (_transactions, _old, state) => assignUids(state),
      }),
    ];
  },
});
