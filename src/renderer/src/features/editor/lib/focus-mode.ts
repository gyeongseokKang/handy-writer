import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface FocusModeOptions {
  /** 켜져 있으면 지금 쓰는 문단 말고는 옅게 보인다. */
  isEnabled: () => boolean;
}

/** 설정이 바뀌었을 때 장식을 다시 계산하라고 알리는 트랜잭션 메타 */
export const FOCUS_REFRESH = "refreshFocus";

/** 커서(또는 선택)가 걸친 문단은 그대로 두고, 나머지 문단에 `focus-dim` 클래스를 붙인다. */
function build(state: EditorState, enabled: boolean) {
  if (!enabled) return DecorationSet.empty;
  const { from, to } = state.selection;
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const end = pos + node.nodeSize;
    // 커서만 있을 때(from === to)도 이 식으로 그 문단 안인지 알 수 있다.
    if (!(from < end && to > pos)) decorations.push(Decoration.node(pos, end, { class: "focus-dim" }));
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}

/**
 * 집중 모드의 문단 강조. 글 내용은 건드리지 않고 문단 요소에 클래스만 붙이므로
 * 한글 조합(IME) 중에도 글자 주변 DOM을 바꾸지 않는다.
 */
export const FocusMode = Extension.create<FocusModeOptions>({
  name: "focusMode",

  addOptions() {
    return { isEnabled: () => false };
  },

  addProseMirrorPlugins() {
    const { options } = this;
    const key = new PluginKey<DecorationSet>("focusMode");
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => build(state, options.isEnabled()),
          apply: (tr, value, _old, state) => (tr.docChanged || tr.selectionSet || tr.getMeta(FOCUS_REFRESH) ? build(state, options.isEnabled()) : value),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
