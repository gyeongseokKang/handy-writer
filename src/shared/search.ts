export interface SearchDoc {
  path: string;
  name: string;
  /** frontmatter를 뺀 본문 */
  body: string;
  tags: string[];
}

export interface MatchRange {
  start: number;
  end: number;
}

export interface SearchSnippet {
  text: string;
  ranges: MatchRange[];
}

export interface SearchResult {
  path: string;
  name: string;
  folder: string;
  tags: string[];
  score: number;
  titleRanges: MatchRange[];
  snippets: SearchSnippet[];
}

const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 90;
const MAX_SNIPPETS = 2;

/** 공백으로 나눈 단어 모두를 포함하는 글만 찾는다. 대소문자는 구분하지 않는다. */
export function splitTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
}

function findAll(haystack: string, term: string): MatchRange[] {
  const ranges: MatchRange[] = [];
  let from = 0;
  for (let at = haystack.indexOf(term, from); at !== -1; at = haystack.indexOf(term, from)) {
    ranges.push({ start: at, end: at + term.length });
    from = at + term.length;
  }
  return ranges;
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MatchRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function clean(line: string) {
  return line.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/, "").trim();
}

function snippetsFor(body: string, terms: string[]): SearchSnippet[] {
  const candidates: { line: string; lower: string; hits: number; first: number }[] = [];
  for (const raw of body.split("\n")) {
    const line = clean(raw);
    if (!line) continue;
    const lower = line.toLowerCase();
    const found = terms.filter((term) => lower.includes(term));
    if (found.length === 0) continue;
    candidates.push({ line, lower, hits: found.length, first: Math.min(...found.map((term) => lower.indexOf(term))) });
  }
  // 단어를 많이 포함한 줄을 먼저, 같으면 위에 있는 줄을 먼저 보여준다.
  const best = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => b.candidate.hits - a.candidate.hits || a.index - b.index)
    .slice(0, MAX_SNIPPETS);

  return best.map(({ candidate }) => {
    const start = Math.max(0, candidate.first - SNIPPET_BEFORE);
    const end = Math.min(candidate.line.length, candidate.first + SNIPPET_AFTER);
    const prefix = start > 0 ? "…" : "";
    const text = `${prefix}${candidate.line.slice(start, end)}${end < candidate.line.length ? "…" : ""}`;
    const lower = text.toLowerCase();
    return { text, ranges: mergeRanges(terms.flatMap((term) => findAll(lower, term))) };
  });
}

function scoreDoc(doc: SearchDoc, terms: string[], nameLower: string, tagsLower: string[], bodyLower: string): number | null {
  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (nameLower === term) termScore += 100;
    else if (nameLower.startsWith(term)) termScore += 60;
    else if (nameLower.includes(term)) termScore += 40;

    if (tagsLower.some((tag) => tag === term)) termScore += 30;
    else if (tagsLower.some((tag) => tag.includes(term))) termScore += 15;

    const occurrences = findAll(bodyLower, term);
    if (occurrences.length > 0) {
      termScore += Math.min(occurrences.length, 5) * 2;
      // 글 앞쪽에 나오면 조금 더 관련이 높다고 본다.
      if ((occurrences[0]?.start ?? Infinity) < 200) termScore += 3;
    }
    if (termScore === 0) return null;
    score += termScore;
  }
  return doc.name ? score : null;
}

export function searchNotes(docs: SearchDoc[], query: string, limit = 30): SearchResult[] {
  const terms = splitTerms(query);
  if (terms.length === 0) return [];

  const results: SearchResult[] = [];
  for (const doc of docs) {
    const nameLower = doc.name.toLowerCase();
    const score = scoreDoc(doc, terms, nameLower, doc.tags.map((tag) => tag.toLowerCase()), doc.body.toLowerCase());
    if (score === null) continue;
    const slash = doc.path.lastIndexOf("/");
    results.push({
      path: doc.path,
      name: doc.name,
      folder: slash === -1 ? "" : doc.path.slice(0, slash),
      tags: doc.tags,
      score,
      titleRanges: mergeRanges(terms.flatMap((term) => findAll(nameLower, term))),
      snippets: snippetsFor(doc.body, terms),
    });
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ko")).slice(0, limit);
}
