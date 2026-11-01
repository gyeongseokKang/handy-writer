import { mask, type SpellIssue } from "./spellcheck";
import { stem } from "./style-lint";

/**
 * 표기 통일: 같은 말을 띄어쓰기·하이픈·대소문자만 다르게 섞어 쓴 곳을 알려 준다 (웹사이트/웹 사이트, e-mail/email, JavaScript/Javascript).
 * 어느 쪽이 맞는지는 판단하지 않고, 이 글에서 더 많이(같으면 먼저) 쓴 표기로 맞추라고 제안한다.
 * 문단 하나가 아니라 글 전체를 봐야 해서 맞춤법·문장 다듬기와 따로 돈다.
 */

interface Occurrence {
  block: number;
  start: number;
  end: number;
  surface: string;
}

/** 한글 낱말, 영문 낱말(하이픈으로 이은 것 포함) */
const TOKEN = /[가-힣]+|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g;
const MIN_KEY_LENGTH = 3;

/** 띄어쓰기·하이픈·대소문자를 지운 비교 열쇠 */
const keyOf = (surface: string) => surface.replace(/[\s-]/g, "").toLowerCase();

/**
 * 같은 표기끼리 묶는 이름. 영문은 첫 글자만 대문자인 것(문장 맨 앞의 Web)을 소문자와 같은 표기로 본다.
 * 글자 가운데 대문자(JavaScript)가 있으면 다른 표기다.
 */
const variantOf = (surface: string) => (/^[A-Z]?[a-z0-9-]*$/.test(surface) ? surface.toLowerCase() : surface);

function collect(blocks: readonly string[]) {
  const groups = new Map<string, Occurrence[]>();
  const add = (key: string, occurrence: Occurrence) => {
    if ([...key].length < MIN_KEY_LENGTH) return;
    const list = groups.get(key);
    if (list) list.push(occurrence);
    else groups.set(key, [occurrence]);
  };

  blocks.forEach((text, block) => {
    const masked = mask(text);
    const tokens = [...masked.matchAll(TOKEN)].map((m) => {
      const korean = /^[가-힣]/.test(m[0]);
      // 한글은 끝의 조사를 뗀 낱말 줄기만 본다.
      const word = korean ? stem(m[0]) : m[0];
      return { start: m.index, end: m.index + word.length, word, korean, rawEnd: m.index + m[0].length };
    });
    tokens.forEach((token, i) => {
      add(keyOf(token.word), { block, start: token.start, end: token.end, surface: token.word });
      // 바로 뒤에 한 칸 띄고 한글 낱말이 오면 붙여 쓴 표기와 견주려고 둘을 이은 표기도 후보로 둔다 (영문 두 낱말은 그냥 다른 말이 대부분이라 뺀다).
      const next = tokens[i + 1];
      if (next && token.korean && next.korean && masked.slice(token.rawEnd, next.start) === " " && token.end === token.rawEnd) {
        add(keyOf(token.word + next.word), { block, start: token.start, end: next.end, surface: `${token.word} ${next.word}` });
      }
    });
  });
  return groups;
}

/**
 * 글 전체(문단 글 목록)에서 표기가 섞인 곳을 찾는다. 결과는 문단 번호 → 그 문단의 항목이고,
 * 위치는 문단 글의 글자 위치다 (맞춤법 검사와 같다).
 */
export function checkConsistency(blocks: readonly string[]): Map<number, SpellIssue[]> {
  const result = new Map<number, SpellIssue[]>();
  const taken = new Map<number, Array<[number, number]>>();

  // 많이 섞인 말부터, 겹치는 자리는 먼저 정한 쪽을 남긴다.
  const found: Array<{ key: string; variants: Map<string, Occurrence[]> }> = [];
  for (const [key, occurrences] of collect(blocks)) {
    const variants = new Map<string, Occurrence[]>();
    for (const occurrence of occurrences) {
      const id = variantOf(occurrence.surface);
      variants.set(id, [...(variants.get(id) ?? []), occurrence]);
    }
    if (variants.size >= 2) found.push({ key, variants });
  }
  found.sort((a, b) => [...b.variants.values()].reduce((n, v) => n + v.length, 0) - [...a.variants.values()].reduce((n, v) => n + v.length, 0));

  for (const { key, variants } of found) {
    const ranked = [...variants.values()].sort((a, b) => b.length - a.length || first(a) - first(b));
    const preferred = ranked[0]!;
    const tie = preferred.length === ranked[1]?.length;
    // 많이 쓴 표기 가운데 가장 흔한 글자 모양을 고친 말로 쓴다.
    const right = mostCommon(preferred.map((o) => o.surface));
    for (const variant of ranked.slice(1)) {
      for (const o of variant) {
        const ranges = taken.get(o.block) ?? [];
        if (ranges.some(([s, e]) => o.start < e && o.end > s)) continue;
        ranges.push([o.start, o.end]);
        taken.set(o.block, ranges);
        const text = blocks[o.block]!.slice(o.start, o.end);
        const hint = tie
          ? `‘${text}’와 ‘${right}’를 이 글에서 섞어 썼어요. 먼저 쓴 ‘${right}’로 통일해 보세요.`
          : `‘${text}’ 대신 이 글에서 ${preferred.length}번 쓴 ‘${right}’로 통일해 보세요.`;
        const list = result.get(o.block) ?? [];
        list.push({ start: o.start, end: o.end, text, replacement: right, ruleId: `style:consistency:${key}`, hint, source: "style" });
        result.set(o.block, list);
      }
    }
  }
  for (const list of result.values()) list.sort((a, b) => a.start - b.start);
  return result;
}

/** 표기가 처음 나온 자리 (문단 번호와 글자 위치를 한 수로) */
const first = (list: Occurrence[]) => Math.min(...list.map((o) => o.block * 1e6 + o.start));

function mostCommon(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}
