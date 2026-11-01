import { Extension } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { kindOfPath } from "@shared/attachments";
import { rowColumns } from "@shared/image-row";

import { nextLabelId } from "./cross-ref";

/**
 * 이미지 나란히 놓기. 한 문단에 이미지(임베드)만 둘 이상 있으면 그 문단을 한 줄(묶음)로 그린다.
 * 파일에는 `![[a.png]] ![[b.png]]`처럼 그대로 남아서 다른 편집기에서도 읽힌다.
 * 묶음의 라벨은 아래 캡션 문단(`^fig-n`)이라, "그림 1. 설명"으로 보이고 내보내기에도 나온다.
 */

const isImageEmbed = (node: PMNode) => node.type.name === "embed" && kindOfPath(String(node.attrs["target"] ?? "")) === "image";

/** 이미지 임베드와 공백만 든 문단이면 그 임베드 개수, 아니면 0 */
export function imageCount(node: PMNode): number {
  if (node.type.name !== "paragraph") return 0;
  let count = 0;
  let ok = true;
  node.forEach((child) => {
    if (isImageEmbed(child)) count++;
    else if (!(child.isText && !child.text?.trim())) ok = false;
  });
  return ok ? count : 0;
}

/** 이미지가 둘 이상 나란히 놓인 문단인지 */
export const isImageRow = (node: PMNode) => imageCount(node) >= 2;

/** 이미지 임베드 사이에 공백을 두어 한 문단으로 만든다. */
function rowParagraph(schema: Schema, embeds: PMNode[]) {
  const space = schema.text(" ");
  const content: PMNode[] = [];
  embeds.forEach((embed, i) => {
    if (i > 0) content.push(space);
    content.push(embed);
  });
  return schema.nodes["paragraph"]!.create(null, content);
}

const CAPTION_END = /(^|\s+)\^(fig|tbl|table)[-_][\w-]*\s*$/i;
const isCaption = (node: PMNode | null | undefined) => !!node && node.type.name === "paragraph" && CAPTION_END.test(node.textContent);

/** 새 문단으로 쓸 묶음 + 라벨 캡션 문단 */
export function rowWithCaption(schema: Schema, doc: PMNode, embeds: PMNode[]) {
  const id = nextLabelId(doc, "fig");
  return { row: rowParagraph(schema, embeds), caption: schema.nodes["paragraph"]!.create(null, schema.text(` ^${id}`)) };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageRow: {
      /** 커서(또는 선택한 블록)의 이미지 문단과 이어진 이미지 문단들을 한 줄로 합치고, 라벨 캡션이 없으면 아래에 넣는다. */
      arrangeImages: () => ReturnType;
      /** 나란히 놓인 이미지를 문단 하나씩으로 푼다. */
      splitImageRow: () => ReturnType;
      /** 이미지 임베드들을 한 줄로 넣고 아래에 라벨 캡션을 만들어 커서를 거기에 둔다. */
      insertImageRow: (targets: string[], pos?: number) => ReturnType;
    };
  }
}

export const ImageRow = Extension.create({
  name: "imageRow",

  addCommands() {
    return {
      arrangeImages:
        () =>
        ({ state, tr, dispatch }) => {
          const { doc, selection, schema } = state;
          const $from = selection.$from;
          if ($from.depth === 0) return false;
          let lo = $from.index(0);
          let hi = selection.$to.depth === 0 ? lo : selection.$to.index(0);
          const total = (i: number) => imageCount(doc.child(i));
          if (lo === hi) {
            if (total(lo) === 0) return false;
            while (lo > 0 && total(lo - 1) > 0) lo--;
            while (hi < doc.childCount - 1 && total(hi + 1) > 0) hi++;
          } else {
            for (let i = lo; i <= hi; i++) if (total(i) === 0) return false;
          }
          const embeds: PMNode[] = [];
          for (let i = lo; i <= hi; i++) doc.child(i).forEach((child) => isImageEmbed(child) && embeds.push(child));
          if (embeds.length < 2) return false;
          if (!dispatch) return true;

          let start = 0;
          for (let i = 0; i < lo; i++) start += doc.child(i).nodeSize;
          let end = start;
          for (let i = lo; i <= hi; i++) end += doc.child(i).nodeSize;
          const hasCaption = isCaption(doc.maybeChild(hi + 1));
          const { row, caption } = rowWithCaption(schema, doc, embeds);
          tr.replaceWith(start, end, hasCaption ? [row] : [row, caption]);
          // 라벨이 새로 생겼으면 커서를 거기에 두어 바로 쓸 수 있게 한다.
          tr.setSelection(TextSelection.create(tr.doc, hasCaption ? start + 1 : start + row.nodeSize + 1)).scrollIntoView();
          return true;
        },

      splitImageRow:
        () =>
        ({ state, tr, dispatch }) => {
          const { doc, schema, selection } = state;
          const $from = selection.$from;
          if ($from.depth === 0) return false;
          const index = $from.index(0);
          const node = doc.child(index);
          if (!isImageRow(node)) return false;
          if (!dispatch) return true;
          const start = $from.before(1);
          const paragraphs: PMNode[] = [];
          node.forEach((child) => isImageEmbed(child) && paragraphs.push(schema.nodes["paragraph"]!.create(null, child)));
          tr.replaceWith(start, start + node.nodeSize, paragraphs);
          tr.setSelection(TextSelection.create(tr.doc, start + 1)).scrollIntoView();
          return true;
        },

      insertImageRow:
        (targets, pos) =>
        ({ state, tr, dispatch }) => {
          const { schema, doc, selection } = state;
          const embeds = targets.map((target) => schema.nodes["embed"]!.create({ target, syntax: "wiki" }));
          if (embeds.length === 0) return false;
          if (!dispatch) return true;
          const $at = pos === undefined ? selection.$to : doc.resolve(Math.min(pos, doc.content.size));
          // 빈 문단 위에서 부르면 그 문단을 대신하고, 아니면 지금 블록 바로 아래에 넣는다.
          const empty = $at.depth === 1 && $at.parent.type.name === "paragraph" && $at.parent.content.size === 0;
          const from = empty ? $at.before(1) : $at.depth > 0 ? $at.after(1) : $at.pos;
          const to = empty ? $at.after(1) : from;
          const { row, caption } = rowWithCaption(schema, doc, embeds);
          tr.replaceWith(from, to, [row, caption]);
          tr.setSelection(TextSelection.create(tr.doc, from + row.nodeSize + 1)).scrollIntoView();
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const build = (doc: PMNode) => {
      const decorations: Decoration[] = [];
      doc.forEach((node, offset) => {
        const count = imageCount(node);
        if (count < 2) return;
        decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: "image-row", style: `--cols:${rowColumns(count)}` }));
      });
      return DecorationSet.create(doc, decorations);
    };
    return [
      new Plugin({
        key: new PluginKey<DecorationSet>("imageRow"),
        state: {
          init: (_config, { doc }) => build(doc),
          apply: (tr, value) => (tr.docChanged ? build(tr.doc) : value),
        },
        props: { decorations(state) { return this.getState(state); } },
      }),
    ];
  },
});
