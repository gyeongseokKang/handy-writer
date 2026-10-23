import { mergeAttributes, Node } from "@tiptap/core";

export const CALLOUT_LABELS: Record<string, string> = {
  note: "노트",
  info: "정보",
  tip: "팁",
  success: "완료",
  question: "질문",
  warning: "주의",
  danger: "위험",
  quote: "인용",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      insertCallout: (type?: string) => ReturnType;
    };
  }
}

/** Obsidian 콜아웃(`> [!note] 제목`)을 다루는 블록. 제목은 속성으로 보관해서 마크다운에 그대로 되돌린다. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      calloutType: { default: "note", parseHTML: (el) => el.getAttribute("data-callout") ?? "note" },
      title: { default: "", parseHTML: (el) => el.getAttribute("data-title") ?? "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
        contentElement: (el) => el.querySelector<HTMLElement>(".callout-body") ?? (el as HTMLElement),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { calloutType, title } = node.attrs as { calloutType: string; title: string };
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "callout",
        "data-callout": calloutType,
        "data-title": title,
      }),
      ["div", { class: "callout-title", contenteditable: "false" }, title || CALLOUT_LABELS[calloutType] || calloutType],
      ["div", { class: "callout-body" }, 0],
    ];
  },

  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src) => src.search(/^> ?\[!/m),
    tokenize(src, _tokens, lexer) {
      const match = /^> ?\[!([\w-]+)\][+-]?[ \t]*([^\n]*)(?:\n|$)((?:>[^\n]*(?:\n|$))*)/.exec(src);
      if (!match) return undefined;
      const body = (match[3] ?? "")
        .split("\n")
        .map((line) => line.replace(/^> ?/, ""))
        .join("\n");
      return {
        type: "callout",
        raw: match[0],
        calloutType: (match[1] ?? "note").toLowerCase(),
        title: match[2] ?? "",
        tokens: lexer.blockTokens(body),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      "callout",
      { calloutType: token.calloutType, title: token.title ?? "" },
      content.length ? content : [helpers.createNode("paragraph")],
    );
  },

  renderMarkdown: (node, helpers) => {
    const { calloutType, title } = (node.attrs ?? {}) as { calloutType?: string; title?: string };
    const header = `> [!${calloutType ?? "note"}]${title ? ` ${title}` : ""}`;
    const body = (node.content ?? []).map((child) =>
      helpers
        .renderChildren([child])
        .split("\n")
        .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
        .join("\n"),
    );
    return body.length ? `${header}\n${body.join("\n>\n")}` : header;
  },

  addCommands() {
    return {
      insertCallout:
        (type = "note") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { calloutType: type, title: "" },
            content: [{ type: "paragraph" }],
          }),
    };
  },
});
