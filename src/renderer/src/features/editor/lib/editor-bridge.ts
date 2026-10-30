import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ApplyResult, EditorBridge, EditorContext, EmbedItem, HeadingItem, TemplateBlockAttrs } from "@/entities/note/model/use-editor-bridge";

import { SPELL_ACTIVE, SPELL_SKIP } from "./spell-check";

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

function findByUid(editor: Editor, typeName: string, uid: string) {
  let found: { pos: number; node: ProseMirrorNode } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === typeName && node.attrs["uid"] === uid) found = { pos, node };
    return !found;
  });
  return found as { pos: number; node: ProseMirrorNode } | null;
}

const findEmbed = (editor: Editor, uid: string) => findByUid(editor, "embed", uid);

/** 마크다운 → 블록 노드 JSON 목록. 비어 있으면 빈 문단 하나. */
function parseBlocks(editor: Editor, markdown: string): JSONContent[] {
  const blocks = editor.markdown?.parse(markdown.trim())?.content ?? [];
  return blocks.length > 0 ? blocks : [{ type: "paragraph" }];
}

function serializeNodes(editor: Editor, nodes: ProseMirrorNode[]) {
  return editor.markdown?.serialize({ type: "doc", content: nodes.map((node) => node.toJSON() as JSONContent) }).trim() ?? "";
}

/** 템플릿 블록은 맥락에서 뺀다 (앞서 만든 AI 결과가 다음 생성의 재료가 되지 않게). */
const isContextNode = (node: ProseMirrorNode) => node.type.name !== "templateBlock";

/** 커서가 있는 곳에서 가까운 섹션(앞의 제목부터 같거나 높은 제목 전까지)에 속한 최상위 블록들 */
function sectionNodes(doc: ProseMirrorNode, top: number): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  doc.forEach((child) => children.push(child));
  let start = 0;
  let level = 7; // 위에 제목이 없으면 다음 제목 전까지가 섹션이다.
  for (let i = top; i >= 0; i--) {
    const child = children[i];
    if (child?.type.name === "heading") {
      start = i;
      level = Number(child.attrs["level"]);
      break;
    }
  }
  let end = children.length;
  for (let j = top + 1; j < children.length; j++) {
    const child = children[j];
    if (child?.type.name === "heading" && Number(child.attrs["level"]) <= level) {
      end = j;
      break;
    }
  }
  return children.slice(start, end);
}

/** frontmatter는 에디터 밖(NoteEditor)에서 들고 있으므로, 태그를 더하는 일은 거기서 넘겨받는다. */
export interface FrontmatterActions {
  addTags: (tags: string[]) => void;
}

export function createEditorBridge(editor: Editor, getNoteName: () => string, frontmatter?: FrontmatterActions): EditorBridge {
  const docEnd = () => editor.state.doc.content.size;

  return {
    addTags: (tags) => frontmatter?.addTags(tags),
    getBodyText: () => editor.getText({ blockSeparator: "\n\n" }),
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

    getSelectionText() {
      const { empty, from, to } = editor.state.selection;
      return empty ? "" : editor.state.doc.textBetween(from, to, " ", " ").trim();
    },

    getTemplateContext(scope) {
      const { doc, selection } = editor.state;
      if (scope === "none" || doc.childCount === 0) return "";
      const children: ProseMirrorNode[] = [];
      doc.forEach((child) => children.push(child));
      if (scope === "note") return serializeNodes(editor, children.filter(isContextNode));
      if (scope === "selection" && !selection.empty) return serialize(editor, selection.from, selection.to);

      const top = Math.min(selection.$head.index(0), doc.childCount - 1);
      const nodes = scope === "section" ? sectionNodes(doc, top) : [children[top]!];
      return serializeNodes(editor, nodes.filter(isContextNode));
    },

    insertTemplateBlock(attrs, markdown) {
      const uid = crypto.randomUUID();
      const { $to } = editor.state.selection;
      const pos = $to.depth > 0 ? $to.after(1) : $to.pos;
      editor
        .chain()
        .focus()
        .insertContentAt(pos, { type: "templateBlock", attrs: { ...attrs, uid }, content: parseBlocks(editor, markdown) })
        .run();
      return uid;
    },

    getTemplateBlock(uid) {
      const found = findByUid(editor, "templateBlock", uid);
      if (!found) return null;
      const { uid: _uid, ...attrs } = found.node.attrs;
      const children: ProseMirrorNode[] = [];
      found.node.forEach((child) => children.push(child));
      return { attrs: attrs as TemplateBlockAttrs, markdown: serializeNodes(editor, children) };
    },

    replaceTemplateBlock(uid, attrs, markdown) {
      const found = findByUid(editor, "templateBlock", uid);
      if (!found) return false;
      const next = editor.schema.nodeFromJSON({ type: "templateBlock", attrs: { ...attrs, uid }, content: parseBlocks(editor, markdown) });
      editor.view.dispatch(editor.state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, next));
      return true;
    },

    listHeadings() {
      const headings: HeadingItem[] = [];
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name !== "heading") return;
        const text = node.textContent.trim();
        if (text) headings.push({ level: Number(node.attrs["level"]), text, pos });
      });
      return headings;
    },

    currentHeadingPos() {
      const { doc, selection } = editor.state;
      let current: number | null = null;
      doc.forEach((node, pos) => {
        if (node.type.name === "heading" && pos <= selection.from && node.textContent.trim()) current = pos;
      });
      return current;
    },

    headingInViewPos() {
      const scroller = editor.view.dom.closest("[data-note-scroller]");
      const top = scroller?.getBoundingClientRect().top ?? 0;
      let current: number | null = null;
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name !== "heading" || !node.textContent.trim()) return;
        const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
        // 화면 위에서 조금 내려온 곳까지 올라온 제목을 지금 읽는 부분으로 본다.
        if (dom && dom.getBoundingClientRect().top - top <= 120) current = pos;
      });
      return current;
    },

    focusHeading(pos) {
      const node = editor.state.doc.nodeAt(pos);
      if (node?.type.name !== "heading") return false;
      // focus()는 다음 프레임에 커서만 겨우 보이게 스크롤해서 아래 스크롤을 덮어쓰므로 끈다.
      editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(pos + node.nodeSize - 1).run();
      // 제목이 화면 맨 위에 오게 한다.
      (editor.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ block: "start", behavior: "smooth" });
      return true;
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

    revealSpell(range) {
      if (editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta(SPELL_ACTIVE, range));
      if (!range) return;
      // 강조한 낱말을 화면 가운데로. 장식이 그려진 뒤라 바로 찾을 수 있다.
      const el = editor.view.dom.querySelector<HTMLElement>(".spell-active");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    },

    applySpell({ from, to }, text, replacement) {
      const { doc } = editor.state;
      if (to > doc.content.size || doc.textBetween(from, to, undefined, "\uFFFC") !== text) return false;
      editor.view.dispatch(editor.state.tr.insertText(replacement, from, to).setMeta(SPELL_ACTIVE, null));
      return true;
    },

    skipSpell(range) {
      editor.view.dispatch(editor.state.tr.setMeta(SPELL_SKIP, range).setMeta(SPELL_ACTIVE, null));
    },

    insertBelowCursor(markdown) {
      const { $to } = editor.state.selection;
      const pos = $to.depth > 0 ? $to.after($to.depth) : $to.pos;
      editor.chain().focus().insertContentAt(pos, markdown, { contentType: "markdown" }).run();
    },
  };
}
