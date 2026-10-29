import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * 그림·표 번호와 상호 참조. Obsidian의 블록 ID 문법을 그대로 쓴다.
 * - 캡션: 그림이나 표 아래 문단 끝에 `^fig-이름` 또는 `^tbl-이름`을 붙이면 "그림 1.", "표 1."이 앞에 붙는다.
 * - 참조: 본문에 `[[#^fig-이름]]`이라고 쓰면 "그림 1"로 보이고, 순서가 바뀌면 번호도 따라간다.
 * 파일에는 문법 그대로 남아서 Obsidian에서도 블록 링크로 동작한다.
 */

export type LabelKind = "fig" | "tbl" | "other";

export interface LabelInfo {
  id: string;
  kind: LabelKind;
  /** 같은 종류 안에서의 번호 (other는 0) */
  number: number;
  /** 문단의 문서 위치 */
  pos: number;
  /** 블록 ID를 뺀 캡션 글 */
  caption: string;
  /** 문단 안에서 `^id` 표시가 시작하는 글자 위치 (앞 공백 포함) */
  markerStart: number;
}

export const KIND_NAME: Record<Exclude<LabelKind, "other">, string> = { fig: "그림", tbl: "표" };

const BLOCK_ID = /(^|\s+)\^([A-Za-z0-9][\w-]*)\s*$/;

export function labelKind(id: string): LabelKind {
  if (/^fig[-_]/i.test(id)) return "fig";
  if (/^(tbl|table)[-_]/i.test(id)) return "tbl";
  return "other";
}

/** "그림 2" 처럼 참조에 보여 줄 이름 */
export function labelName(info: Pick<LabelInfo, "kind" | "number" | "id">) {
  return info.kind === "other" ? info.id : `${KIND_NAME[info.kind]} ${info.number}`;
}

/** 문서의 블록 ID를 모아 종류별로 나온 순서대로 번호를 매긴다. 같은 ID가 또 나오면 처음 것만 쓴다. */
export function collectLabels(doc: PMNode): Map<string, LabelInfo> {
  const labels = new Map<string, LabelInfo>();
  const counters = { fig: 0, tbl: 0, other: 0 };
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const text = node.textContent;
    const match = BLOCK_ID.exec(text);
    if (!match) return false;
    const id = match[2] ?? "";
    if (labels.has(id)) return false;
    const kind = labelKind(id);
    const number = kind === "other" ? 0 : ++counters[kind];
    labels.set(id, { id, kind, number, pos, caption: text.slice(0, match.index).trim(), markerStart: match.index });
    return false;
  });
  return labels;
}

/** 참조 링크의 대상이 블록 ID면 그 ID (`#^fig-a` → `fig-a`) */
export const refId = (target: string) => (target.startsWith("#^") ? target.slice(2) : null);

/** 아직 쓰지 않은 다음 번호의 ID (fig-1, fig-2, …) */
export function nextLabelId(doc: PMNode, kind: Exclude<LabelKind, "other">) {
  const used = new Set(collectLabels(doc).keys());
  for (let n = 1; ; n++) if (!used.has(`${kind}-${n}`)) return `${kind}-${n}`;
}

function scrollTo(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + node.nodeSize - 1)));
  editor.view.focus();
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center", behavior: "smooth" });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    crossRef: {
      /** 지금 문단 아래에 다음 번호의 캡션 문단(`^fig-n` 또는 `^tbl-n`)을 넣고 커서를 캡션 자리로 옮긴다. */
      insertCaption: (kind: "fig" | "tbl") => ReturnType;
    };
  }
}

export const CrossRef = Extension.create({
  name: "crossRef",
  // 위키링크(기본 100)보다 먼저 클릭을 받아야 `[[#^id]]`가 다른 글을 열려고 하지 않는다.
  priority: 110,

  addCommands() {
    return {
      insertCaption:
        (kind) =>
        ({ tr, dispatch, state }) => {
          const paragraph = state.schema.nodes["paragraph"];
          if (!paragraph) return false;
          if (!dispatch) return true;
          const id = nextLabelId(tr.doc, kind);
          const $from = tr.selection.$from;
          // 빈 줄에서 불렀으면 그 줄을 캡션으로 쓴다.
          if ($from.depth === 1 && $from.parent.type === paragraph && $from.parent.content.size === 0) {
            tr.insertText(` ^${id}`, $from.pos);
            tr.setSelection(TextSelection.create(tr.doc, $from.pos)).scrollIntoView();
            return true;
          }
          // 아니면 커서가 있는 맨 위 블록(그림 문단이나 표) 바로 아래에 넣는다.
          const after = $from.depth > 0 ? $from.after(1) : tr.doc.content.size;
          tr.insert(after, paragraph.create(null, state.schema.text(` ^${id}`)));
          tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const key = new PluginKey<DecorationSet>("crossRef");

    const build = (doc: PMNode) => {
      const labels = collectLabels(doc);
      const decorations: Decoration[] = [];
      for (const info of labels.values()) {
        const node = doc.nodeAt(info.pos);
        if (!node) continue;
        const start = info.pos + 1;
        decorations.push(Decoration.inline(start + info.markerStart, start + node.content.size, { class: "block-id" }));
        if (info.kind === "other") continue;
        // 번호는 문단의 ::before로 그린다. 위젯 요소를 문단 앞에 넣으면 캡션 맨 앞에 쓰는 글자가 엉뚱한 곳으로 간다.
        decorations.push(Decoration.node(info.pos, info.pos + node.nodeSize, { class: "caption", "data-caption": `${labelName(info)}.`, style: `--caption: "${labelName(info)}. "` }));
      }
      doc.descendants((node, pos) => {
        if (node.type.name !== "wikiLink") return true;
        const id = refId(String(node.attrs["target"]));
        if (id === null) return false;
        const info = labels.get(id);
        const text = info ? labelName(info) : `${KIND_NAME[labelKind(id) as "fig"] ?? "참조"} ?`;
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: info ? "xref" : "xref xref-missing",
            style: `--xref: "${text.replace(/"/g, "")}"`,
            title: info ? info.caption || labelName(info) : `^${id}가 붙은 그림·표가 없어요`,
          }),
        );
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
            // 위키링크보다 먼저 받아서, 이 글 안을 가리키는 링크(`#^id`, `#제목`)는 다른 글을 열지 않고 그 자리로 간다.
            click: (_view, event) => {
              const el = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-wikilink]");
              const target = el?.dataset["wikilink"] ?? "";
              if (!target.startsWith("#")) return false;
              event.preventDefault();
              const id = refId(target);
              if (id !== null) {
                const info = collectLabels(editor.state.doc).get(id);
                if (info) scrollTo(editor, info.pos);
                return true;
              }
              const heading = target.slice(1).trim().toLowerCase();
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === "heading" && node.textContent.trim().toLowerCase() === heading) {
                  scrollTo(editor, pos);
                  return false;
                }
                return !node.isTextblock;
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
