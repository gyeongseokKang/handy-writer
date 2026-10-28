import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: FindMatch[];
  /** 지금 가리키는 항목의 순서. 항목이 없으면 -1 */
  current: number;
}

const LEAF = "￼";
const key = new PluginKey<FindState & { decorations: DecorationSet }>("findReplace");

const EMPTY: FindState = { query: "", caseSensitive: false, matches: [], current: -1 };

type Doc = Parameters<typeof DecorationSet.create>[0];

/** 글 전체에서 `query`와 일치하는 자리를 문서 위치로 찾는다. 위키링크 같은 inline 노드는 한 글자로 센다. */
export function findMatches(doc: Doc, query: string, caseSensitive: boolean): FindMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const found: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const raw = node.textBetween(0, node.content.size, undefined, LEAF);
    const text = caseSensitive ? raw : raw.toLowerCase();
    // toLowerCase가 길이를 바꾸는 글자(İ 등)가 있으면 위치가 어긋나므로 대소문자 구분으로 되돌린다.
    const haystack = text.length === raw.length ? text : raw;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
      found.push({ from: pos + 1 + at, to: pos + 1 + at + needle.length });
    }
    return false;
  });
  return found;
}

function build(doc: Doc, query: string, caseSensitive: boolean, preferred: number) {
  const matches = findMatches(doc, query, caseSensitive);
  const current = matches.length === 0 ? -1 : Math.min(Math.max(preferred, 0), matches.length - 1);
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? "find-match find-match-current" : "find-match" })),
  );
  return { query, caseSensitive, matches, current, decorations };
}

interface FindMeta {
  query?: string;
  caseSensitive?: boolean;
  current?: number;
}

/** 글 안에서 찾기. 일치하는 자리를 칠하고, 문서 내용은 바꾸지 않는다. */
export const FindReplace = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_config, { doc }) => build(doc, "", false, -1),
          apply(tr, value) {
            const meta = tr.getMeta(key) as FindMeta | undefined;
            if (!meta && !tr.docChanged) return value;
            return build(tr.doc, meta?.query ?? value.query, meta?.caseSensitive ?? value.caseSensitive, meta?.current ?? value.current);
          },
        },
        props: { decorations: (state) => key.getState(state)?.decorations ?? null },
      }),
    ];
  },
});

export function getFindState(editor: Editor): FindState {
  const { query, caseSensitive, matches, current } = key.getState(editor.state) ?? { ...EMPTY };
  return { query, caseSensitive, matches, current };
}

function dispatchMeta(editor: Editor, meta: FindMeta) {
  editor.view.dispatch(editor.state.tr.setMeta(key, meta));
}

function reveal(editor: Editor, match: FindMatch | undefined) {
  if (!match) return;
  const node = editor.view.domAtPos(match.from).node;
  (node instanceof Element ? node : node.parentElement)?.scrollIntoView?.({ block: "center" });
}

/** 찾는 말을 바꾼다. 처음 일치하는 항목을 가리킨다. */
export function setFind(editor: Editor, query: string, caseSensitive = getFindState(editor).caseSensitive) {
  dispatchMeta(editor, { query, caseSensitive, current: 0 });
  const state = getFindState(editor);
  reveal(editor, state.matches[state.current]);
}

/** 다음(1) 또는 이전(-1) 항목으로 옮기고 그 자리로 스크롤한다. 끝에서는 반대쪽 끝으로 돌아간다. */
export function stepFind(editor: Editor, direction: 1 | -1) {
  const { matches, current } = getFindState(editor);
  if (matches.length === 0) return;
  const next = (current + direction + matches.length) % matches.length;
  dispatchMeta(editor, { current: next });
  reveal(editor, matches[next]);
}

/** 지금 항목을 바꾸고 다음 항목으로 넘어간다. 바꿀 항목이 없으면 false */
export function replaceCurrent(editor: Editor, replacement: string) {
  const { matches, current } = getFindState(editor);
  const match = matches[current];
  if (!match) return false;
  // 바꾼 뒤 일치 목록이 다시 계산되므로, 같은 순서가 곧 다음 항목이다.
  editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to).setMeta(key, { current }));
  reveal(editor, getFindState(editor).matches[getFindState(editor).current]);
  return true;
}

/** 일치하는 모든 자리를 바꾸고 바꾼 개수를 돌려준다. 한 번에 되돌릴 수 있다. */
export function replaceAll(editor: Editor, replacement: string) {
  const { matches } = getFindState(editor);
  if (matches.length === 0) return 0;
  const tr = editor.state.tr;
  // 뒤에서부터 바꿔야 앞쪽 위치가 밀리지 않는다.
  for (const match of [...matches].reverse()) tr.insertText(replacement, match.from, match.to);
  editor.view.dispatch(tr);
  return matches.length;
}

export function clearFind(editor: Editor) {
  if (getFindState(editor).query) dispatchMeta(editor, { query: "", current: -1 });
}
