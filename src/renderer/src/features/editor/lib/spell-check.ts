import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { checkSpelling, issueKey, type SpellIssue } from "@shared/spellcheck";

export interface SpellTarget {
  issue: SpellIssue;
  /** 문서 안의 위치 */
  from: number;
  to: number;
  /** 화면 위치 (팝업을 붙일 곳) */
  rect: { left: number; bottom: number; top: number };
}

export interface SpellCheckOptions {
  isEnabled: () => boolean;
  isIgnored: (key: string) => boolean;
  onCount: (count: number) => void;
  onSelect: (target: SpellTarget) => void;
}

/** 설정이 바뀌었을 때 장식을 다시 계산하라고 알리는 트랜잭션 메타 */
export const SPELL_REFRESH = "refreshSpell";

const LEAF = "￼";
const key = new PluginKey<{ items: Array<{ from: number; to: number; issue: SpellIssue }>; decorations: DecorationSet }>("spellCheck");

/**
 * 글을 쓰는 동안 자주 틀리는 표기에 밑줄을 긋는다 (문서 내용은 바꾸지 않는다).
 * 지금 입력 중인 낱말은 커서가 벗어난 뒤에 표시해서, 한글 조합(IME) 중에 글자 주변 DOM을 건드리지 않는다.
 */
export const SpellCheck = Extension.create<SpellCheckOptions>({
  name: "spellCheck",

  addOptions() {
    return { isEnabled: () => true, isIgnored: () => false, onCount: () => {}, onSelect: () => {} };
  },

  addProseMirrorPlugins() {
    const { options } = this;
    let lastCount = -1;

    const compute = (state: import("@tiptap/pm/state").EditorState) => {
      const items: Array<{ from: number; to: number; issue: SpellIssue }> = [];
      if (options.isEnabled()) {
        const codeMark = state.schema.marks["code"];
        state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return true;
          if (node.type.spec.code) return false;
          // 위키링크 같은 inline 노드는 한 글자로 바꿔서 글자 위치와 문서 위치를 맞춘다.
          const text = node.textBetween(0, node.content.size, undefined, LEAF);
          for (const issue of checkSpelling(text)) {
            const from = pos + 1 + issue.start;
            const to = pos + 1 + issue.end;
            if (codeMark && state.doc.rangeHasMark(from, to, codeMark)) continue;
            if (options.isIgnored(issueKey(issue))) continue;
            // 커서가 낱말 안이나 끝에 있으면 아직 쓰는 중이라고 본다.
            const { empty, from: cursor } = state.selection;
            if (empty && cursor >= from && cursor <= to) continue;
            items.push({ from, to, issue });
          }
          return false;
        });
      }
      const decorations = DecorationSet.create(
        state.doc,
        items.map((item) => Decoration.inline(item.from, item.to, { class: "spell-error", "data-spell": item.issue.ruleId })),
      );
      return { items, decorations };
    };

    return [
      new Plugin({
        key,
        state: {
          init: (_config, state) => compute(state),
          apply: (tr, value, _old, state) => (tr.docChanged || tr.selectionSet || tr.getMeta(SPELL_REFRESH) ? compute(state) : value),
        },
        view: () => ({
          update: (view) => {
            const count = key.getState(view.state)?.items.length ?? 0;
            if (count !== lastCount) {
              lastCount = count;
              options.onCount(count);
            }
          },
        }),
        props: {
          decorations: (state) => key.getState(state)?.decorations,
          handleClick: (view, pos, event) => {
            const el = (event.target as HTMLElement | null)?.closest(".spell-error");
            if (!el) return false;
            const hit = key.getState(view.state)?.items.find((item) => pos >= item.from && pos <= item.to);
            if (!hit) return false;
            const start = view.coordsAtPos(hit.from);
            const end = view.coordsAtPos(hit.to);
            options.onSelect({ ...hit, rect: { left: start.left, top: start.top, bottom: Math.max(start.bottom, end.bottom) } });
            return false;
          },
        },
      }),
    ];
  },
});
