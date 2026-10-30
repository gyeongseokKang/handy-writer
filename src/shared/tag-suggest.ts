import { createInlineTagRegex, parseNote } from "./note-parser";
import { COMMON, stem } from "./style-lint";

/**
 * 태그 추천: 작업 폴더에 이미 있는 태그 가운데 이 글에 어울리는 것을 고른다 (오프라인).
 * - 본문에 태그 이름이 나오면 크게 더한다.
 * - 그 태그가 붙은 글들과 이 글의 주요 낱말이 얼마나 비슷한지(TF-IDF 코사인)를 더한다.
 * - 이 글과 링크로 이어진 글에 붙은 태그를 조금 더한다.
 * 기존 태그가 마땅치 않을 때를 위해, 이 글에 자주 나오는 낱말을 새 태그 후보로 몇 개 덧붙인다.
 */

export interface TagSuggestion {
  tag: string;
  /** 높을수록 잘 맞는다 (비교용, 단위 없음) */
  score: number;
  /** 왜 추천했는지 한 줄 */
  reason: string;
  /** existing: 작업 폴더에 있는 태그, new: 이 글의 낱말로 만든 새 태그 후보 */
  kind: "existing" | "new";
  /** 이 태그가 붙은 글 수 (새 후보는 0) */
  count: number;
}

export interface TagDoc {
  path: string;
  name: string;
  body: string;
  tags: string[];
}

export interface TagLinkEntry {
  path: string;
  name: string;
  links: string[];
}

const MAX_SUGGESTIONS = 8;
const MAX_NEW = 3;
const MIN_SCORE = 0.08;
const TOP_TERMS = 40;

const STOP = new Set([
  ...COMMON,
  ..."이런 그런 저런 같은 대한 위해 통해 대해 관한 따라 경우 때문에 그때 지금 오늘 내일 어제 여기 거기 무엇 어떤 모든 각각 서로 다른 많은 정말 매우 너무 조금 그냥 바로 이제 먼저 다음 처음 마지막 하나 두번째 이번 그래도 그러면 또는 혹은 및 등등 것은 것이 것을 수도 있습니다 합니다 했습니다 됩니다 입니다 있어요 해요 했어요 돼요 이에요 예요"
    .split(" "),
  ..."the and for with that this from are was were have has had not but you your our their they them its into about will can just than then also more most some any all each other such only very what when where which while".split(" "),
]);

/** 본문에서 낱말을 뽑는다: 코드·주소·링크 문법을 걷어내고, 한글은 조사를 뗀 줄기, 영어는 소문자 */
export function terms(text: string): string[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, " $1 ")
    .replace(createInlineTagRegex(), " ");
  const out: string[] = [];
  for (const m of clean.matchAll(/[가-힣]{2,}|[A-Za-z][A-Za-z0-9-]{2,}/g)) {
    const word = /[가-힣]/.test(m[0]) ? stem(m[0]) : m[0].toLowerCase();
    if (word.length >= 2 && !STOP.has(word) && !STOP.has(m[0])) out.push(word);
  }
  return out;
}

type Vector = Map<string, number>;

function counts(words: string[]): Vector {
  const v: Vector = new Map();
  for (const w of words) v.set(w, (v.get(w) ?? 0) + 1);
  return v;
}

function normalize(v: Vector, limit = TOP_TERMS): Vector {
  const top = [...v].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const length = Math.hypot(...top.map(([, x]) => x)) || 1;
  return new Map(top.map(([w, x]) => [w, x / length]));
}

const dot = (a: Vector, b: Vector) => {
  let sum = 0;
  for (const [w, x] of a) sum += x * (b.get(w) ?? 0);
  return sum;
};

const leaf = (tag: string) => tag.split("/").pop() ?? tag;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 본문에 태그 이름이 낱말로 나오는지. 한글은 조사가 붙어도 되지만 다른 낱말의 일부(책 → 책임)는 아니다. */
function mentions(text: string, word: string) {
  if (!word) return false;
  const pattern = /[가-힣]/.test(word)
    ? new RegExp(`(?<![가-힣])${escape(word)}(?:은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|이다|이야)?(?![가-힣])`)
    : new RegExp(`(?<![\\w-])${escape(word)}(?![\\w-])`, "i");
  return pattern.test(text);
}

export function suggestTags(current: { path: string; text: string }, docs: TagDoc[], index: TagLinkEntry[] = []): TagSuggestion[] {
  const others = docs.filter((d) => d.path !== current.path);
  const self = docs.find((d) => d.path === current.path);
  const name = self?.name ?? current.path.replace(/^.*\//, "").replace(/\.md$/, "");
  // 이미 붙은 태그: 저장된 글의 태그와, 아직 저장하지 않은 본문의 #태그
  const have = new Set([...(self?.tags ?? []), ...parseNote(current.text).tags].map((t) => t.toLowerCase()));

  // 문서 빈도와 IDF
  const docTerms = new Map(others.map((d) => [d.path, counts(terms(`${d.name} ${d.body}`))]));
  const df = new Map<string, number>();
  for (const v of docTerms.values()) for (const w of v.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log((others.length + 1) / ((df.get(w) ?? 0) + 1)) + 1;
  const weigh = (v: Vector) => new Map([...v].map(([w, n]) => [w, (1 + Math.log(n)) * idf(w)]));

  const mineCounts = counts(terms(`${name} ${current.text}`));
  const mine = normalize(weigh(mineCounts));
  const docVectors = new Map([...docTerms].map(([path, v]) => [path, normalize(weigh(v))]));

  // 링크로 이어진 글 (이 글이 가리키는 글, 이 글을 가리키는 글)
  const byName = new Map(index.map((e) => [e.name.toLowerCase(), e.path]));
  const selfEntry = index.find((e) => e.path === current.path);
  const neighbors = new Set<string>([
    ...(selfEntry?.links ?? []).map((l) => byName.get(l.toLowerCase())).filter((p): p is string => !!p),
    ...index.filter((e) => e.links.some((l) => l.toLowerCase() === name.toLowerCase())).map((e) => e.path),
  ]);
  neighbors.delete(current.path);

  // 태그별 글 모음 (대소문자 무시, 처음 본 표기를 쓴다)
  const tagged = new Map<string, { tag: string; paths: string[] }>();
  for (const d of others) {
    for (const tag of d.tags) {
      const key = tag.toLowerCase();
      const entry = tagged.get(key) ?? { tag, paths: [] };
      entry.paths.push(d.path);
      tagged.set(key, entry);
    }
  }

  const lowerText = `${name}\n${current.text}`.toLowerCase();
  const results: TagSuggestion[] = [];
  for (const [key, { tag, paths }] of tagged) {
    if (have.has(key)) continue;
    const centroid: Vector = new Map();
    for (const path of paths) for (const [w, x] of docVectors.get(path) ?? []) centroid.set(w, (centroid.get(w) ?? 0) + x / paths.length);
    const similarity = dot(mine, normalize(centroid, TOP_TERMS * 2));
    const mentioned = mentions(lowerText, leaf(tag).toLowerCase());
    const linked = paths.filter((p) => neighbors.has(p)).length;
    const score = similarity + (mentioned ? 0.6 : 0) + Math.min(linked, 3) * 0.15;
    if (score < MIN_SCORE) continue;
    const reason = mentioned
      ? `본문에 ‘${leaf(tag)}’가 나와요`
      : linked > 0
        ? `연결된 글 ${linked}개에 붙은 태그예요`
        : `비슷한 글에 붙은 태그예요 (글 ${paths.length}개)`;
    results.push({ tag, score, reason, kind: "existing", count: paths.length });
  }
  results.sort((a, b) => b.score - a.score || b.count - a.count);
  const picked = results.slice(0, MAX_SUGGESTIONS);

  // 새 태그 후보: 이 글에 두 번 넘게 나오고 다른 글에는 드문 낱말
  const known = new Set([...tagged.keys(), ...have, ...picked.map((s) => s.tag.toLowerCase())].map((t) => leaf(t)));
  const fresh = [...mineCounts]
    .filter(([w, n]) => n >= 2 && !known.has(w.toLowerCase()) && !/^\d/.test(w))
    .map(([w, n]) => ({ w, n, s: (1 + Math.log(n)) * idf(w) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_NEW)
    .map(({ w, n }) => ({ tag: w, score: 0, reason: `이 글에 ${n}번 나오는 낱말이에요`, kind: "new" as const, count: 0 }));

  return [...picked, ...fresh];
}
