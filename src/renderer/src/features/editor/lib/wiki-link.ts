import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Suggestion from "@tiptap/suggestion";

import { createSuggestionRender, type SuggestionItem } from "./suggestion-render";

export interface WikiLinkOptions {
  /** `[[` 자동완성에 보여줄 글 이름들 */
  getNoteNames: () => string[];
  /** 링크를 눌렀을 때 호출된다. target은 `이름#섹션` 형태일 수 있다. */
  onNavigate: (target: string) => void;
  /** 가리키는 글이 있는지. 없으면 흐리게 보여준다. */
  isResolved: (target: string) => boolean;
}

const MAX_SUGGESTIONS = 8;
const NEW_NOTE_PREFIX = "__new__:";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (target: string, alias?: string | null) => ReturnType;
    };
  }
}

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true };
  },

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-wikilink") ?? "",
      },
      alias: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-alias"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { target, alias } = node.attrs as { target: string; alias: string | null };
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "wikilink",
        "data-wikilink": target,
        ...(alias ? { "data-alias": alias } : {}),
      }),
      alias ?? target,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.target}]]`;
  },

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize(src) {
      const match = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
      if (!match) return undefined;
      return { type: "wikiLink", raw: match[0], target: match[1], alias: match[2] ?? null };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("wikiLink", { target: token.target, alias: token.alias ?? null }),

  renderMarkdown: (node) =>
    `[[${node.attrs?.target ?? ""}${node.attrs?.alias ? `|${node.attrs.alias}` : ""}]]`,

  addCommands() {
    return {
      insertWikiLink:
        (target, alias = null) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { target, alias } }),
    };
  },

  addInputRules() {
    // nodeInputRule은 캡처 그룹이 있으면 그 부분만 바꿔서 `[[`와 `]]`가 글자로 남는다. 매치 전체를 노드로 바꾼다.
    const type = this.type;
    return [
      new InputRule({
        find: /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, type.create({ target: match[1], alias: match[2] ?? null }));
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { options } = this;
    return [
      new Plugin({
        key: new PluginKey("wikiLinkClick"),
        props: {
          decorations: ({ doc }) => {
            const decorations: Decoration[] = [];
            doc.descendants((node, pos) => {
              if (node.type.name === "wikiLink" && !options.isResolved(String(node.attrs["target"]))) {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "wikilink-missing" }));
              }
              return true;
            });
            return DecorationSet.create(doc, decorations);
          },
          handleDOMEvents: {
            click: (_view, event) => {
              const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-wikilink]");
              if (!el) return false;
              event.preventDefault();
              options.onNavigate(el.dataset["wikilink"] ?? "");
              return true;
            },
          },
        },
      }),
      Suggestion<SuggestionItem<string>, SuggestionItem<string>>({
        editor: this.editor,
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        allow: ({ state }) => !state.selection.$from.parent.type.spec.code,
        items: ({ query }) => {
          const needle = query.trim().toLowerCase();
          const names = options.getNoteNames();
          const matches = names
            .filter((name) => name.toLowerCase().includes(needle))
            .slice(0, MAX_SUGGESTIONS)
            .map((name) => ({ id: name, title: name, payload: name }));
          const exact = names.some((name) => name.toLowerCase() === needle);
          if (needle && !exact) {
            matches.push({ id: NEW_NOTE_PREFIX + query.trim(), title: `“${query.trim()}” 새 글로 연결`, payload: query.trim() });
          }
          return matches;
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [{ type: "wikiLink", attrs: { target: props.payload, alias: null } }, { type: "text", text: " " }])
            .run();
        },
        render: createSuggestionRender(),
      }),
    ];
  },
});
