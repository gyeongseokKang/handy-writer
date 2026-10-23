import { parse as parseYaml } from "yaml";

import { splitFrontmatter } from "./frontmatter";

export interface ParsedNote {
  /** frontmatter의 tags와 본문의 #태그 (`#` 없이, 대소문자 무시 중복 제거) */
  tags: string[];
  /** `[[이름#섹션|별칭]]`에서 이름 부분 (중복 제거, 같은 글 안의 `[[#섹션]]`은 제외) */
  links: string[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const WIKILINK = /!?\[\[([^[\]\n|]+)(?:\|[^[\]\n]*)?\]\]/g;
const INLINE_TAG = /(?<![\p{L}\p{N}_/&#(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

/** 본문에서 `#태그`를 찾는 정규식. 상태가 있는 g 플래그라서 쓸 때마다 새로 만든다. */
export const createInlineTagRegex = () => new RegExp(INLINE_TAG.source, INLINE_TAG.flags);

/** 코드 블록과 인라인 코드를 빼고 돌려준다. 코드 안의 `[[x]]`나 `#x`는 링크나 태그가 아니다. */
function stripCode(body: string) {
  const kept: string[] = [];
  let fence: { char: string; length: number } | null = null;
  for (const line of body.split("\n")) {
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open?.[1]) {
      fence = { char: open[1][0] ?? "`", length: open[1].length };
      continue;
    }
    kept.push(line.replace(/`[^`\n]*`/g, ""));
  }
  return kept.join("\n");
}

/** `이름#섹션`, `이름^블록`에서 이름만 남긴다. */
export function linkTargetName(target: string) {
  return (target.split("#")[0] ?? "").split("^")[0]?.trim() ?? "";
}

function normalizeTag(tag: string) {
  return tag.replace(/^#/, "").trim();
}

function frontmatterTags(frontmatter: string): string[] {
  if (!frontmatter) return [];
  const inner = frontmatter.replace(/^---[ \t]*\r?\n/, "").replace(/(?:\r?\n)?---[ \t]*\r?\n?$/, "");
  let data: unknown;
  try {
    data = parseYaml(inner);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const raw = record["tags"] ?? record["tag"];
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
  return list.filter((tag): tag is string => typeof tag === "string").map(normalizeTag).filter(Boolean);
}

export function parseNote(raw: string): ParsedNote {
  const { frontmatter, body } = splitFrontmatter(raw);
  const text = stripCode(body);

  const links = new Set<string>();
  for (const match of text.matchAll(WIKILINK)) {
    const name = linkTargetName(match[1] ?? "");
    if (name) links.add(name);
  }

  const tags = new Map<string, string>();
  const addTag = (tag: string) => {
    if (tag && !tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
  };
  frontmatterTags(frontmatter).forEach(addTag);
  const withoutLinks = text.replace(WIKILINK, "");
  for (const match of withoutLinks.matchAll(INLINE_TAG)) addTag(match[1] ?? "");

  return { tags: [...tags.values()], links: [...links] };
}

interface Resolvable {
  path: string;
  name: string;
}

/** 링크 대상(`이름` 또는 `폴더/이름`)이 가리키는 글의 경로를 찾는다. 같은 이름이 여럿이면 가장 얕은 경로를 쓴다. */
export function createLinkResolver(notes: Resolvable[]) {
  const byPath = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const note of notes) {
    byPath.set(note.path.replace(/\.md$/i, "").toLowerCase(), note.path);
    const key = note.name.toLowerCase();
    const current = byName.get(key);
    if (!current || note.path.length < current.length) byName.set(key, note.path);
  }

  return (target: string): string | null => {
    const key = linkTargetName(target).replace(/\.md$/i, "").toLowerCase();
    if (!key) return null;
    return byPath.get(key) ?? byName.get(key.split("/").pop() ?? key) ?? null;
  };
}

/**
 * 코드 밖의 위키링크 중 `matches`가 참인 것의 대상 이름을 `rename`이 돌려준 값으로 바꾼다.
 * `#섹션`, `^블록`, `|별칭`은 그대로 둔다.
 */
export function rewriteWikiLinks(
  content: string,
  matches: (target: string) => boolean,
  rename: (target: string) => string,
): { content: string; count: number } {
  let count = 0;
  let fence: { char: string; length: number } | null = null;

  const rewriteSegment = (segment: string) =>
    segment.replace(/(!?\[\[)([^[\]\n|]+?)((?:\|[^[\]\n]*)?\]\])/g, (whole, open: string, target: string, close: string) => {
      const name = linkTargetName(target);
      if (!name || !matches(name)) return whole;
      const suffix = target.slice(target.search(/[#^]/) === -1 ? target.length : target.search(/[#^]/));
      count++;
      return `${open}${rename(name)}${suffix}${close}`;
    });

  const lines = content.split("\n").map((line) => {
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`);
      if (close.test(line)) fence = null;
      return line;
    }
    const open = FENCE_OPEN.exec(line);
    if (open?.[1]) {
      fence = { char: open[1][0] ?? "`", length: open[1].length };
      return line;
    }
    // 인라인 코드는 홀수 번째 조각이므로 건드리지 않는다.
    return line
      .split(/(`[^`\n]*`)/)
      .map((segment, index) => (index % 2 === 0 ? rewriteSegment(segment) : segment))
      .join("");
  });

  return { content: lines.join("\n"), count };
}
