import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      /** 커서 자리에 새 각주 `[^n]`을 넣고, 글 끝에 그 각주의 내용 줄을 만들어 커서를 옮긴다. */
      insertFootnote: () => ReturnType;
    };
  }
}

export interface FootnoteInfo {
  label: string;
  /** 본문에 처음 나온 순서대로 매긴 번호 */
  number: number;
  /** 각주 내용 (없으면 null: 내용 줄이 없는 각주) */
  text: string | null;
  refPos: number | null;
  defPos: number | null;
}

/** 본문의 각주 표시와 내용 줄을 모아 번호를 매긴다. 내용만 있고 본문에서 쓰지 않은 각주는 뒤에 붙는다. */
export function collectFootnotes(doc: PMNode): Map<string, FootnoteInfo> {
  const notes = new Map<string, FootnoteInfo>();
  const get = (label: string) => {
    let info = notes.get(label);
    if (!info) notes.set(label, (info = { label, number: 0, text: null, refPos: null, defPos: null }));
    return info;
  };
  let next = 1;
  doc.descendants((node, pos) => {
    if (node.type.name === "footnoteRef") {
      const info = get(String(node.attrs["label"]));
      if (info.refPos === null) {
        info.refPos = pos;
        info.number = next++;
      }
    } else if (node.type.name === "footnoteDef") {
      const info = get(String(node.attrs["label"]));
      if (info.defPos === null) {
        info.defPos = pos;
        info.text = node.textContent;
      }
      return false;
    }
    return true;
  });
  for (const info of notes.values()) if (info.number === 0) info.number = next++;
  return notes;
}

/** 아직 쓰지 않은 다음 숫자 이름 */
export function nextFootnoteLabel(doc: PMNode) {
  let max = 0;
  for (const label of collectFootnotes(doc).keys()) if (/^\d+$/.test(label)) max = Math.max(max, Number(label));
  return String(max + 1);
}

const REF = /^\[\^([^\]\s]+)\](?!:)/;
const DEF = /^\[\^([^\]\s]+)\]:[ \t]?([^\n]*(?:\n(?:[ \t]{2,}|\t)[^\n]*)*)(?:\n|$)/;

function scrollToPos(editor: Editor, pos: number, select: "inside-end" | "after") {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  const target = select === "inside-end" ? pos + node.nodeSize - 1 : pos + node.nodeSize;
  editor.chain().focus().setTextSelection(target).run();
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center", behavior: "smooth" });
}

/** 본문의 각주 표시 `[^1]`. 위첨자 번호로 보이고, 올리면 내용을, 누르면 내용 줄로 간다. */
export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { label: { default: "1", rendered: false, parseHTML: (el) => el.getAttribute("data-footnote") ?? "1" } };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  // 화면에서는 이름 대신 번호를 보여준다 (번호는 데코레이션이 --fn으로 넘겨 준다). 내보낸 HTML에는 이름이 남는다.
  renderHTML({ node, HTMLAttributes }) {
    const label = String(node.attrs["label"]);
    return ["sup", mergeAttributes(HTMLAttributes, { class: "footnote-ref", "data-footnote": label }), ["span", { class: "footnote-text" }, label]];
  },

  renderText({ node }) {
    return `[^${node.attrs["label"]}]`;
  },

  markdownTokenizer: {
    name: "footnoteRef",
    level: "inline",
    start: (src) => src.indexOf("[^"),
    tokenize(src) {
      const match = REF.exec(src);
      return match ? { type: "footnoteRef", raw: match[0], label: match[1] } : undefined;
    },
  },

  parseMarkdown: (token, helpers) => helpers.createNode("footnoteRef", { label: token.label }),

  renderMarkdown: (node) => `[^${node.attrs?.["label"] ?? "1"}]`,

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ editor, tr, dispatch }) => {
          const refType = editor.schema.nodes["footnoteRef"];
          const defType = editor.schema.nodes["footnoteDef"];
          if (!refType || !defType) return false;
          if (!dispatch) return true;
          const label = nextFootnoteLabel(tr.doc);
          const at = tr.selection.to;
          tr.insert(at, refType.create({ label }));
          // 글 끝의 빈 문단(마지막 줄 자리)은 건너뛰고 그 앞에 넣는다.
          let end = tr.doc.content.size;
          for (let i = tr.doc.childCount - 1; i > 0; i--) {
            const child = tr.doc.child(i);
            if (child.type.name !== "paragraph" || child.content.size > 0) break;
            end -= child.nodeSize;
          }
          tr.insert(end, defType.create({ label }));
          // 새 내용 줄 안으로 커서를 옮겨 바로 쓸 수 있게 한다.
          tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView();
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const key = new PluginKey<DecorationSet>("footnotes");
    const build = (doc: PMNode) => {
      const notes = collectFootnotes(doc);
      const decorations: Decoration[] = [];
      doc.descendants((node, pos) => {
        const info = node.type.name === "footnoteRef" || node.type.name === "footnoteDef" ? notes.get(String(node.attrs["label"])) : undefined;
        if (!info) return true;
        if (node.type.name === "footnoteRef") {
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              "data-number": String(info.number),
              style: `--fn: "${info.number}"`,
              title: info.text === null ? "내용이 없는 각주예요" : info.text || "(빈 각주)",
              class: info.text === null ? "footnote-missing" : "",
            }),
          );
          return true;
        }
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-number": String(info.number), style: `--fn: "${info.number}"`, class: info.refPos === null ? "footnote-unused" : "" }));
        return false;
      });
      return DecorationSet.create(doc, decorations);
    };

    return [
      new Plugin({
        key,
        state: {
          init: (_config, { doc }) => build(doc),
          apply: (tr, value) => (tr.docChanged ? build(tr.doc) : value),
        },
        props: {
          decorations: (state) => key.getState(state) ?? null,
          handleDOMEvents: {
            click: (_view, event) => {
              const target = event.target as HTMLElement | null;
              const ref = target?.closest<HTMLElement>("sup[data-footnote]");
              const back = target?.closest<HTMLElement>(".footnote-label");
              if (!ref && !back) return false;
              const label = (ref ?? back?.closest<HTMLElement>("[data-footnote]"))?.dataset["footnote"] ?? "";
              const info = collectFootnotes(editor.state.doc).get(label);
              event.preventDefault();
              if (ref && info?.defPos != null) scrollToPos(editor, info.defPos, "inside-end");
              else if (back && info?.refPos != null) scrollToPos(editor, info.refPos, "after");
              return true;
            },
          },
        },
      }),
    ];
  },
});

/** 각주 내용 줄 `[^1]: 내용`. 글 어디에 있어도 되지만 보통 글 끝에 모인다. */
export const FootnoteDef = Node.create({
  name: "footnoteDef",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return { label: { default: "1", rendered: false, parseHTML: (el) => el.getAttribute("data-footnote") ?? "1" } };
  },

  parseHTML() {
    return [{ tag: "div[data-footnote-def]", contentElement: (el) => el.querySelector<HTMLElement>(".footnote-body") ?? (el as HTMLElement) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = String(node.attrs["label"]);
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "footnote-def", "data-footnote-def": "", "data-footnote": label }),
      ["span", { class: "footnote-label", contenteditable: "false", title: "본문의 각주 자리로 가기" }, ["span", { class: "footnote-text" }, label]],
      ["span", { class: "footnote-body" }, 0],
    ];
  },

  markdownTokenizer: {
    name: "footnoteDef",
    level: "block",
    start: (src) => src.search(/^\[\^[^\]\s]+\]:/m),
    tokenize(src, _tokens, lexer) {
      const match = DEF.exec(src);
      if (!match) return undefined;
      // 들여 쓴 이어지는 줄은 한 문단으로 합친다.
      const text = (match[2] ?? "").split("\n").map((line) => line.trim()).join(" ");
      return { type: "footnoteDef", raw: match[0], label: match[1], tokens: lexer.inlineTokens(text) };
    },
  },

  parseMarkdown: (token, helpers) => helpers.createNode("footnoteDef", { label: token.label }, helpers.parseInline(token.tokens ?? [])),

  renderMarkdown: (node, helpers) => `[^${node.attrs?.["label"] ?? "1"}]: ${helpers.renderChildren(node.content ?? [])}`,

  addKeyboardShortcuts() {
    return {
      // 내용 줄 끝에서 Enter를 누르면 새 문단으로 나간다 (각주 내용은 한 문단).
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== this.name) return false;
        const after = $from.after();
        return editor.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run();
      },
      // 빈 내용 줄에서 Backspace를 누르면 그 줄을 지운다.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== this.name || $from.parentOffset !== 0) return false;
        if ($from.parent.content.size > 0) return true;
        return editor.chain().deleteRange({ from: $from.before(), to: $from.after() }).run();
      },
    };
  },
});
