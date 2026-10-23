import { Node } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { formatTemplateMeta, parseTemplateMeta, type ContextScope } from "@shared/templates";

import { TemplateBlockView } from "../ui/template-block-view";

export interface TemplateBlockOptions {
  /** false면 화면용 NodeView를 만들지 않는다 (React 없이 문서만 다루는 테스트용) */
  renderView: boolean;
}

/** 제목 줄 끝에 `<!--hw-template {...}-->`가 붙은 콜아웃만 템플릿 블록으로 읽는다. */
const HEADER = /^> ?\[!([\w-]+)\][+-]?[ \t]*([^\n]*?)[ \t]*(<!--hw-template \{[^\n]*?\}-->)[ \t]*(?:\n|$)((?:>[^\n]*(?:\n|$))*)/;

function assignUids(state: EditorState) {
  const seen = new Set<string>();
  let tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "templateBlock") return true;
    const uid = node.attrs["uid"] as string | null;
    if (!uid || seen.has(uid)) tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, uid: crypto.randomUUID() });
    else seen.add(uid);
    return true;
  });
  return tr.docChanged ? tr.setMeta("addToHistory", false).setMeta("preventUpdate", true) : null;
}

/**
 * 템플릿으로 만든 블록 (앱 전용). 화면에서는 제목줄에 "다시 생성" 같은 버튼이 있는 상자이고,
 * 파일에는 평범한 콜아웃으로 저장된다. 입력값은 제목 줄 끝의 HTML 주석에 들어간다.
 *   > [!tip] 더 알아보기 <!--hw-template {"id":"more-info",...}-->
 *   > 내용
 * 그래서 다른 프로그램에서는 콜아웃으로 보이고, export할 때는 주석만 떼면 된다.
 */
export const TemplateBlock = Node.create<TemplateBlockOptions>({
  name: "templateBlock",
  // 마크다운 토크나이저는 우선순위가 "낮은" 확장이 먼저 시도된다 (Tiptap이 높은 순으로 등록하고
  // marked가 나중에 등록한 것을 앞에 두기 때문). 일반 콜아웃(기본 100)의 `> [!type]` 읽기보다 먼저여야 한다.
  priority: 50,
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return { renderView: true };
  },

  addAttributes() {
    return {
      uid: { default: null, rendered: false },
      templateId: { default: "", rendered: false },
      style: { default: "note", parseHTML: (el) => el.getAttribute("data-style") ?? "note" },
      title: { default: "", parseHTML: (el) => el.getAttribute("data-title") ?? "" },
      inputs: { default: {}, rendered: false },
      extra: { default: "", rendered: false },
      web: { default: false, rendered: false },
      scope: { default: "section", rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-template-block]", contentElement: (el) => el.querySelector<HTMLElement>(".template-block-body") ?? (el as HTMLElement) }];
  },

  renderHTML({ node }) {
    const { style, title, templateId } = node.attrs as { style: string; title: string; templateId: string };
    return [
      "div",
      { class: "template-block", "data-template-block": templateId, "data-style": style, "data-title": title },
      ["div", { class: "template-block-header", contenteditable: "false" }, title],
      ["div", { class: "template-block-body" }, 0],
    ];
  },

  markdownTokenizer: {
    name: "templateBlock",
    level: "block",
    start: (src) => src.search(/^> ?\[![\w-]+\][^\n]*<!--hw-template /m),
    tokenize(src, _tokens, lexer) {
      const match = HEADER.exec(src);
      if (!match) return undefined;
      const meta = parseTemplateMeta(match[3] ?? "");
      if (!meta) return undefined; // 메타데이터가 깨졌으면 일반 콜아웃으로 읽는다.
      const body = (match[4] ?? "")
        .split("\n")
        .map((line) => line.replace(/^> ?/, ""))
        .join("\n");
      return { type: "templateBlock", raw: match[0], style: (match[1] ?? "note").toLowerCase(), title: match[2] ?? "", meta, tokens: lexer.blockTokens(body) };
    },
  },

  parseMarkdown: (token, helpers) => {
    const meta = token.meta as ReturnType<typeof parseTemplateMeta> & object;
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      "templateBlock",
      { uid: crypto.randomUUID(), templateId: meta.id, style: token.style, title: token.title ?? "", inputs: meta.inputs, extra: meta.extra, web: meta.web, scope: meta.scope },
      content.length ? content : [helpers.createNode("paragraph")],
    );
  },

  renderMarkdown: (node, helpers) => {
    const a = (node.attrs ?? {}) as { templateId?: string; style?: string; title?: string; inputs?: Record<string, string>; extra?: string; web?: boolean; scope?: ContextScope };
    const meta = formatTemplateMeta({ id: a.templateId ?? "", inputs: a.inputs ?? {}, extra: a.extra ?? "", web: a.web === true, scope: a.scope ?? "section" });
    const header = `> [!${a.style ?? "note"}]${a.title ? ` ${a.title}` : ""} ${meta}`;
    const body = (node.content ?? []).map((child) =>
      helpers
        .renderChildren([child])
        .split("\n")
        .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
        .join("\n"),
    );
    return body.length ? `${header}\n${body.join("\n>\n")}` : header;
  },

  addNodeView() {
    return this.options.renderView ? ReactNodeViewRenderer(TemplateBlockView) : null;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("templateBlockUid"),
        appendTransaction: (_transactions, _old, state) => assignUids(state),
      }),
    ];
  },
});
