import { mask, type SpellIssue } from "./spellcheck";

/**
 * 문장 다듬기: 틀린 건 아니지만 고치면 더 읽기 쉬운 곳을 알려 준다 (오프라인, 규칙 기반).
 * 맞춤법보다 판단이 갈리는 영역이라, 거의 늘 고치는 편이 나은 것만 넣고 나머지는 알려 주기만 한다.
 */

/** 이보다 긴 문장(공백 포함)은 나눠 보라고 알린다. */
export const LONG_SENTENCE = 100;

/** 한 문단에서 이만큼째부터 알린다 (한 번은 괜찮다). */
const OVERUSE_FROM = 2;

/** 겹말과 이중 피동처럼 거의 늘 고치는 편이 나은 표현: [틀린 말, 고친 말, 설명] */
const PHRASES: Array<[string, string, string]> = [
  ["미리 예약", "예약", "‘예약’에 이미 ‘미리’가 들어 있어요."],
  ["미리 예습", "예습", "‘예습’에 이미 ‘미리’가 들어 있어요."],
  ["미리 예방", "예방", "‘예방’에 이미 ‘미리’가 들어 있어요."],
  ["과반수 이상", "과반수", "‘과반수’가 이미 절반을 넘는 수예요."],
  ["남은 여생", "여생", "‘여생’이 이미 남은 생이에요."],
  ["가장 최고", "최고", "‘최’가 이미 ‘가장’이에요."],
  ["가장 최선", "최선", "‘최’가 이미 ‘가장’이에요."],
  ["가장 최초", "최초", "‘최’가 이미 ‘가장’이에요."],
  ["다시 재개", "재개", "‘재’가 이미 ‘다시’예요."],
  ["새로 신설", "신설", "‘신’이 이미 ‘새로’예요."],
  ["역전 앞", "역 앞", "‘역전’이 이미 ‘역 앞’이에요."],
  ["되어진다", "된다", "‘되다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["되어지는", "되는", "‘되다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["되어진", "된", "‘되다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["되어졌", "됐", "‘되다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["보여진다", "보인다", "‘보이다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["보여지는", "보이는", "‘보이다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["보여진", "보인", "‘보이다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["보여졌", "보였", "‘보이다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["쓰여진", "쓰인", "‘쓰이다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["쓰여졌", "쓰였", "‘쓰이다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["잊혀진", "잊힌", "‘잊히다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["잊혀졌", "잊혔", "‘잊히다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["읽혀진", "읽힌", "‘읽히다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["믿겨진", "믿긴", "‘믿기다’에 ‘-어지다’를 겹친 이중 피동이에요."],
  ["에 있어서", "에서", "번역투예요. ‘~에서’로 충분해요."],
];

/** 같은 문장에서 다시 써도 거슬리지 않는 낱말 */
const COMMON = new Set(
  "그것 이것 저것 우리 저희 그리고 하지만 그러나 그래서 그런데 때문 정도 경우 사람 생각 이렇게 그렇게 어떻게 하나 모두 가장 다시 아주 정말 조금 많이 함께 있다 없다 하다 되다 한다 했다 된다 있는 없는 하는 되는 있고 없고 하고".split(" "),
);

/** 어절 끝의 조사를 떼어 낱말 줄기를 얻는다 (‘글을’, ‘글이’, ‘글에서’ → ‘글’). */
const PARTICLE = /(에서부터|으로부터|에게서|이라는|에서는|으로는|에게는|처럼|보다|까지|부터|에게|한테|에서|으로|이나|이며|라는|에는|와는|과는|은|는|이|가|을|를|의|에|로|와|과|도|만|나)$/;

function stem(word: string) {
  const bare = word.replace(PARTICLE, "");
  return bare.length >= 2 ? bare : word;
}

const sentenceRanges = (text: string) => {
  const ranges: Array<[number, number]> = [];
  const re = /[^.!?。…\n]+[.!?。…]*/g;
  for (const m of text.matchAll(re)) {
    // 앞뒤 공백은 빼고 문장만 가리킨다.
    const lead = m[0].length - m[0].trimStart().length;
    const body = m[0].trim();
    if (body) ranges.push([m.index + lead, m.index + lead + body.length]);
  }
  return ranges;
};

const issue = (text: string, start: number, end: number, ruleId: string, hint: string, replacement?: string): SpellIssue => ({
  start,
  end,
  text: text.slice(start, end),
  replacement: replacement ?? text.slice(start, end),
  ruleId,
  hint,
  source: "style",
  ...(replacement === undefined ? { noFix: true } : {}),
});

/** 문단 하나(줄바꿈 없는 글)를 검사한다. 위치는 맞춤법 검사와 같은 방식(글자 위치)이다. */
export function checkStyle(text: string): SpellIssue[] {
  const masked = mask(text);
  const found: SpellIssue[] = [];
  const taken: Array<[number, number]> = [];
  const add = (item: SpellIssue, exclusive = true) => {
    if (exclusive && taken.some(([s, e]) => item.start < e && item.end > s)) return;
    if (exclusive) taken.push([item.start, item.end]);
    found.push(item);
  };

  for (const [wrong, right, hint] of PHRASES) {
    for (let at = masked.indexOf(wrong); at !== -1; at = masked.indexOf(wrong, at + wrong.length)) add(issue(text, at, at + wrong.length, `style:${wrong}`, hint, right));
  }

  for (const m of masked.matchAll(/(?<=\S) {2,}(?=\S)/g)) add(issue(text, m.index, m.index + m[0].length, "style:double-space", "띄어쓰기가 두 칸 이상이에요.", " "));

  // 한 문단에서 되풀이되는 끝맺음
  const overused: Array<[RegExp, string, string]> = [
    [/것이다|것입니다|것이에요/g, "style:geosida", "‘~것이다’를 이 문단에서 또 썼어요. 빼도 뜻이 같은지 보세요."],
    [/수 있다|수 있습니다|수 있어요|수 있는/g, "style:su-itda", "‘~수 있다’를 이 문단에서 또 썼어요. 단정해도 되는지 보세요."],
  ];
  for (const [re, id, hint] of overused) {
    [...masked.matchAll(re)].slice(OVERUSE_FROM - 1).forEach((m) => add(issue(text, m.index, m.index + m[0].length, id, hint)));
  }

  for (const [start, end] of sentenceRanges(masked)) {
    // 같은 문장 안에서 되풀이한 낱말 (두 번째부터)
    const seen = new Map<string, number>();
    for (const m of masked.slice(start, end).matchAll(/[가-힣]{2,}/g)) {
      const key = stem(m[0]);
      if (key.length < 2 || COMMON.has(key) || COMMON.has(m[0])) continue;
      if (seen.has(key)) {
        const at = start + m.index;
        add(issue(text, at, at + key.length, `style:repeat:${key}`, `‘${key}’를 한 문장에서 또 썼어요. 다른 말로 바꾸거나 한 번만 써 보세요.`));
      } else seen.set(key, m.index);
    }
    const length = [...text.slice(start, end)].length;
    if (length > LONG_SENTENCE) {
      // 문장 전체는 다른 항목과 겹쳐도 함께 보여 준다.
      add(issue(text, start, end, "style:long", `문장이 ${length}자예요. 두 문장으로 나누면 읽기 쉬워요.`), false);
    }
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end);
}
