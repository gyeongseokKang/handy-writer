import { Extension } from "@tiptap/core";
import type { MarkType, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { mapTyposToIssues, maskForOnline, mergeIssues, type OnlineSpellResult } from "@shared/online-spell";
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
  /** 온라인 검사. 없으면 규칙 기반 검사만 한다. */
  checkOnline?: (maskedText: string) => Promise<OnlineSpellResult>;
  isOnlineEnabled?: () => boolean;
  onOnlineStatus?: (status: "ok" | "offline") => void;
  /** 글이 바뀐 뒤 온라인 검사를 보내기까지 기다리는 시간 */
  onlineDelayMs?: number;
}

/** 설정이 바뀌었을 때 장식을 다시 계산하라고 알리는 트랜잭션 메타 */
export const SPELL_REFRESH = "refreshSpell";

const LEAF = "￼";
const ONLINE_DELAY_MS = 1500;
const OFFLINE_RETRY_MS = 30_000;
const MAX_BATCH = 8;
const MAX_CACHE = 400;
const MIN_ONLINE_LENGTH = 4;

/** 문단 글 → 온라인 검사 결과. 같은 글을 다시 보내지 않도록 모든 에디터가 함께 쓴다. */
const onlineCache = new Map<string, SpellIssue[]>();

function remember(text: string, issues: SpellIssue[]) {
  onlineCache.delete(text);
  onlineCache.set(text, issues);
  if (onlineCache.size > MAX_CACHE) onlineCache.delete(onlineCache.keys().next().value as string);
}

/** 테스트에서 캐시를 비운다. */
export const clearOnlineSpellCache = () => onlineCache.clear();

/**
 * 문단의 글자를 뽑는다. 위키링크 같은 inline 노드는 한 글자(LEAF)로 바꾸고,
 * 코드 서식이 입혀진 글자는 같은 길이의 공백으로 바꾼다 (코드는 검사하지도, 서버로 보내지도 않는다).
 * 글자 위치와 문서 위치가 어긋나지 않도록 길이는 항상 그대로다.
 */
export function blockText(node: ProseMirrorNode, codeMark: MarkType | undefined): string {
  let text = "";
  node.forEach((child) => {
    if (!child.isText) text += LEAF;
    else text += codeMark && child.marks.some((mark) => mark.type === codeMark) ? " ".repeat(child.text?.length ?? 0) : (child.text ?? "");
  });
  return text;
}

interface Item {
  from: number;
  to: number;
  issue: SpellIssue;
}

interface PluginState {
  items: Item[];
  decorations: DecorationSet;
  /** 온라인 검사가 필요한데 아직 결과가 없는 문단 글 */
  missing: string[];
}

const key = new PluginKey<PluginState>("spellCheck");

/**
 * 글을 쓰는 동안 자주 틀리는 표기에 밑줄을 긋는다 (문서 내용은 바꾸지 않는다).
 * - 규칙 기반 검사는 바로, 온라인 검사(다음·네이버)는 글쓰기가 잠깐 멈춘 뒤 결과가 오면 합친다.
 * - 지금 입력 중인 낱말은 커서가 벗어난 뒤에 표시해서, 한글 조합(IME) 중에 글자 주변 DOM을 건드리지 않는다.
 */
export const SpellCheck = Extension.create<SpellCheckOptions>({
  name: "spellCheck",

  addOptions() {
    return { isEnabled: () => true, isIgnored: () => false, onCount: () => {}, onSelect: () => {} };
  },

  addProseMirrorPlugins() {
    const { options } = this;
    let lastCount = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let offlineUntil = 0;
    const pending = new Set<string>();
    const inflight = new Set<string>();

    const onlineOn = () => Boolean(options.checkOnline && options.isOnlineEnabled?.() && options.isEnabled());

    const compute = (state: EditorState): PluginState => {
      const items: Item[] = [];
      const missing = new Set<string>();
      if (options.isEnabled()) {
        const codeMark = state.schema.marks["code"];
        const useOnline = onlineOn();
        const { empty, from: cursor } = state.selection;
        state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return true;
          if (node.type.spec.code) return false;
          const text = blockText(node, codeMark);
          let issues = checkSpelling(text);
          if (useOnline && text.length >= MIN_ONLINE_LENGTH) {
            const masked = maskForOnline(text);
            const cached = onlineCache.get(masked);
            if (cached) issues = mergeIssues(issues, cached);
            else missing.add(masked);
          }
          for (const issue of issues) {
            const from = pos + 1 + issue.start;
            const to = pos + 1 + issue.end;
            if (codeMark && state.doc.rangeHasMark(from, to, codeMark)) continue;
            if (options.isIgnored(issueKey(issue))) continue;
            // 커서가 낱말 안이나 끝에 있으면 아직 쓰는 중이라고 본다.
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
      return { items, decorations, missing: [...missing] };
    };

    const flush = (view: EditorView) => {
      const batch = [...pending].slice(0, MAX_BATCH);
      batch.forEach((text) => pending.delete(text));
      if (batch.length === 0 || !options.checkOnline) return;

      void Promise.all(
        batch.map(async (text) => {
          inflight.add(text);
          try {
            const result = await options.checkOnline!(text);
            options.onOnlineStatus?.(result.status);
            if (result.status === "ok") remember(text, mapTyposToIssues(text, result.typos));
            else offlineUntil = Date.now() + OFFLINE_RETRY_MS;
          } catch {
            options.onOnlineStatus?.("offline");
            offlineUntil = Date.now() + OFFLINE_RETRY_MS;
          } finally {
            inflight.delete(text);
          }
        }),
      ).then(() => {
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(SPELL_REFRESH, true));
      });
    };

    const schedule = (view: EditorView, texts: string[]) => {
      if (Date.now() < offlineUntil) return;
      let added = false;
      for (const text of texts) {
        if (!inflight.has(text) && !pending.has(text)) {
          pending.add(text);
          added = true;
        }
      }
      if (!added) return;
      clearTimeout(timer);
      timer = setTimeout(() => flush(view), options.onlineDelayMs ?? ONLINE_DELAY_MS);
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
            const state = key.getState(view.state);
            const count = state?.items.length ?? 0;
            if (count !== lastCount) {
              lastCount = count;
              options.onCount(count);
            }
            if (state && state.missing.length > 0) schedule(view, state.missing);
          },
          destroy: () => clearTimeout(timer),
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
