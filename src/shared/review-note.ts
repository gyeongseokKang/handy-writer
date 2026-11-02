/**
 * 작업 폴더의 글을 핸디 리뷰 글로 게시하고, 핸디 리뷰 글을 작업 폴더로 가져온다.
 * 리뷰 정보(별점, 한 줄 결론 등)는 글 frontmatter의 `review:` 아래에 두고, 제목은 글 이름, 태그는 글의 `tags`를 그대로 쓴다.
 * main·renderer 양쪽에서 쓴다.
 */
import { isMap, parseDocument, type Document } from "yaml";

import { isRemoteUrl, decodeMarkdownTarget, kindOfPath, parseEmbedParams } from "./attachments";
import { isTitleHeading } from "./title-heading";
import {
  REVIEW_CATEGORIES, REVIEW_CATEGORY_LABEL, REVIEWS_DIR, slugify, today,
  type ReviewCategory, type ReviewFrontmatter, type ReviewLink,
} from "./review";

export const REVIEW_KEY = "review";

/** 글 frontmatter의 `review:` 아래에 저장하는 값 */
export interface ReviewMeta {
  category: ReviewCategory;
  rating: number;
  verdict: string;
  target: string;
  pros: string[];
  cons: string[];
  price?: string;
  links: ReviewLink[];
  /** 커버 이미지: 첨부 이름(`사진.png`) 또는 https 주소 */
  cover?: string;
  featured?: boolean;
  address?: string;
  mapUrl?: string;
  visitedAt?: string;
  youtubeId?: string;
  /** 사이트 주소의 마지막 부분 (/review/<slug>). 비우면 글 이름으로 만든다. */
  slug?: string;
  /** 리뷰 날짜. 비우면 처음 게시한 날 */
  date?: string;
  /** 게시한 저장소 안 경로. 다시 게시하면 이 글을 고친다. */
  published?: string;
}

export interface ReviewNotePreview {
  /** 저장소 안 리뷰 글 경로 */
  path: string;
  slug: string;
  date: string;
  /** 리뷰 글 파일 내용 그대로 */
  markdown: string;
  warnings: string[];
  /** 이번 게시로 지울 예전 경로 (분류·주소·날짜를 바꿨을 때) */
  replaces: string | null;
}

export interface ReviewNotePublishResult extends ReviewNotePreview {
  committed: boolean;
  sha: string;
  /** 게시한 뒤 글 frontmatter에 남길 리뷰 정보 (slug·date·published가 채워짐) */
  meta: ReviewMeta;
}

export function defaultReviewMeta(category: ReviewCategory = "etc"): ReviewMeta {
  return {
    category, rating: 4, verdict: "", target: "", pros: [], cons: [], links: [],
    ...(category === "place" ? { address: "" } : {}),
    ...(category === "video" ? { youtubeId: "" } : {}),
  };
}

export function reviewBodyTemplate(category: ReviewCategory) {
  return category === "place"
    ? "## 어떤 곳인가\n\n## 가보니\n\n## 결론\n"
    : category === "video"
      ? "## 한 줄 요약\n\n## 볼 만한 부분\n\n## 결론\n"
      : "## 왜 골랐나\n\n## 써보니\n\n## 결론\n";
}

const inner = (frontmatter: string) => frontmatter.replace(/^---[ \t]*\r?\n/, "").replace(/(?:\r?\n)?---[ \t]*\r?\n?$/, "");

function readDoc(frontmatter: string): Document | null {
  if (!frontmatter.trim()) return parseDocument("");
  const doc = parseDocument(inner(frontmatter));
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) return null;
  return doc;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
const strList = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((s) => s.trim()) : typeof v === "string" && v.trim() ? [v] : []);

const categoryOf = (value: string): ReviewCategory | null => {
  const v = value.trim().toLowerCase();
  const found = REVIEW_CATEGORIES.find((c) => c === v || REVIEW_CATEGORY_LABEL[c] === value.trim());
  return found ?? null;
};

/**
 * frontmatter의 `review:`를 읽는다. 없으면 null.
 * 속성 표에서 `review`를 값 없이(또는 `review: book`, `review: 책`처럼 분류만) 더해도 리뷰로 본다.
 */
export function readReviewMeta(frontmatter: string): ReviewMeta | null {
  const doc = readDoc(frontmatter);
  const data = doc?.toJS() as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object" || !(REVIEW_KEY in data)) return null;
  const value = data[REVIEW_KEY];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return defaultReviewMeta(categoryOf(str(value)) ?? "etc");
  }
  const raw = value as Record<string, unknown>;
  const category = categoryOf(str(raw["category"])) ?? "etc";
  const meta: ReviewMeta = {
    ...defaultReviewMeta(category),
    rating: Number.isFinite(Number(raw["rating"])) ? Number(raw["rating"]) : 4,
    verdict: str(raw["verdict"]),
    target: str(raw["target"]),
    pros: strList(raw["pros"]),
    cons: strList(raw["cons"]),
    links: (Array.isArray(raw["links"]) ? raw["links"] : []).map((l: Record<string, unknown>) => ({
      label: str(l?.["label"]), url: str(l?.["url"]), affiliate: !!l?.["affiliate"],
    })),
  };
  for (const key of ["price", "cover", "address", "mapUrl", "visitedAt", "youtubeId", "slug", "date", "published"] as const) {
    if (raw[key] !== undefined && raw[key] !== null) meta[key] = str(raw[key]);
  }
  if (raw["featured"]) meta.featured = true;
  return meta;
}

/** 속성 표에 한 줄로 보여 줄 요약: `책 · ★4.5 · 게시됨` */
export function reviewSummary(frontmatter: string) {
  const meta = readReviewMeta(frontmatter);
  if (!meta) return "";
  return [REVIEW_CATEGORY_LABEL[meta.category], `★${meta.rating}`, meta.published ? "게시됨" : "게시 전"].join(" · ");
}

/** 저장할 때 빈 값은 뺀다 (frontmatter가 지저분해지지 않게). */
function compact(meta: ReviewMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "string" && v === "" && !["verdict", "target"].includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/** frontmatter의 `review:`를 바꾸거나(null이면 지운다) 새로 넣는다. 다른 항목과 주석, 순서는 그대로 둔다. */
export function writeReviewMeta(frontmatter: string, meta: ReviewMeta | null): string {
  const doc = readDoc(frontmatter);
  if (!doc) throw new Error("frontmatter를 읽을 수 없어서 리뷰 정보를 저장하지 못했어요.");
  if (meta === null) {
    if (isMap(doc.contents)) doc.delete(REVIEW_KEY);
  } else {
    if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
    doc.set(REVIEW_KEY, doc.createNode(compact(meta)));
  }
  if (!isMap(doc.contents) || doc.contents.items.length === 0) return "";
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n`;
}

/** 게시하기 전에 사이트 스키마에서 막히는 것을 미리 알려 준다. 문제가 없으면 빈 배열 */
export function reviewProblems(meta: ReviewMeta): string[] {
  const problems: string[] = [];
  if (!meta.verdict.trim()) problems.push("한 줄 결론을 적어 주세요.");
  if (!meta.target.trim()) problems.push("추천 대상을 적어 주세요.");
  for (const link of meta.links) if (link.url.trim() && !/^https?:\/\/\S+$/i.test(link.url.trim())) problems.push(`링크 주소가 올바르지 않아요: ${link.url}`);
  if (meta.mapUrl?.trim() && !/^https?:\/\/\S+$/i.test(meta.mapUrl.trim())) problems.push("지도 링크 주소가 올바르지 않아요.");
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) problems.push("날짜는 2026-11-02 모양으로 적어 주세요.");
  return problems;
}

export const reviewSlugOf = (meta: ReviewMeta, title: string) => slugify(meta.slug?.trim() || title);

/** 게시된 경로에서 사이트 주소용 slug를 꺼낸다 (handy-review의 slugOf와 같은 규칙). */
export const slugOfReviewPath = (path: string) => (path.split("/").pop() ?? "").replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");

export const reviewPathFor = (meta: ReviewMeta, title: string, date: string) =>
  `${REVIEWS_DIR}/${meta.category}/${date}-${reviewSlugOf(meta, title)}.md`;

// ── 본문 바꾸기 ────────────────────────────────────────────

export interface ConvertContext {
  /** 글 제목. 본문 맨 앞의 같은 `# 제목` 줄은 사이트가 제목을 따로 보여 주므로 뺀다. */
  title: string;
  /** 첨부 이름 → 리뷰 글에서 쓸 상대 경로(./폴더/파일). 못 찾으면 null */
  asset: (target: string) => string | null;
  /** `[[글]]` 링크 대상이 게시된 리뷰면 그 slug, 아니면 null (글자만 남긴다) */
  linkSlug: (name: string) => string | null;
  /** `![[글]]`, `![[글#소제목]]` 끼워 넣기를 펼친 마크다운. 못 찾으면 null */
  embedNote?: (target: string) => string | null;
}

export interface ConvertResult { body: string; warnings: string[] }

const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const CALLOUT = /^(\s*>\s*)\[!([\w-]+)\][+-]?\s*(.*)$/;
const BLOCK_ID = /\s+\^[\w-]+\s*$/;
const WIKI_EMBED = /!\[\[([^\]\n]+)\]\]/g;
const MD_IMAGE = /!\[([^\]\n]*)\]\(([^)\s]+|<[^>\n]+>)(?:\s+"[^"\n]*")?\)/g;
const WIKI_LINK = /(?<!!)\[\[([^\]\n]+)\]\]/g;
const EMBED_OR_IMAGE = new RegExp(`${WIKI_EMBED.source}|${MD_IMAGE.source}`, "g");

function convertInline(text: string, ctx: ConvertContext, warnings: string[]): string {
  const media = (target: string, label: string) => {
    const clean = target.trim();
    if (isRemoteUrl(clean)) return kindOfPath(clean.split("?")[0] ?? clean) === "image" ? `![${label}](${clean})` : `[${label || clean}](${clean})`;
    const kind = kindOfPath(clean);
    if (kind === "other") return null; // 첨부가 아니면 글 끼워 넣기
    const rel = ctx.asset(clean);
    if (!rel) {
      warnings.push(`첨부를 찾지 못해 뺐어요: ${clean}`);
      return "";
    }
    return kind === "image" ? `![${label}](${rel})` : `[${label || clean.split("/").pop()}](${rel})`;
  };

  // 위키 임베드와 마크다운 이미지를 한 번에 바꾼다 (바꾼 결과를 다시 바꾸지 않게).
  let out = text.replace(EMBED_OR_IMAGE, (whole, wikiBody: string | undefined, alt: string | undefined, rawTarget: string | undefined) => {
    if (wikiBody !== undefined) {
      const [target = "", ...rest] = wikiBody.split("|");
      const { label } = parseEmbedParams(rest);
      const converted = media(target, label);
      if (converted !== null) return converted;
      const embedded = ctx.embedNote?.(target.trim()) ?? null;
      if (embedded === null) {
        warnings.push(`끼워 넣은 글을 찾지 못해 뺐어요: ${target.trim()}`);
        return "";
      }
      return embedded;
    }
    const { label } = parseEmbedParams((alt ?? "").split("|"));
    return media(decodeMarkdownTarget(rawTarget ?? ""), label) ?? whole;
  });
  out = out.replace(WIKI_LINK, (_whole, body: string) => {
    const [target = "", ...rest] = body.split("|");
    const label = rest.join("|").trim();
    const name = (target.split("#")[0] ?? "").split("^")[0]?.trim() ?? "";
    if (!name) return label; // [[#소제목]], [[#^fig-1]] 같은 글 안 참조
    const slug = ctx.linkSlug(name);
    if (slug) return label ? `[[${slug}|${label}]]` : `[[${slug}|${name}]]`;
    return label || name;
  });
  return out;
}

/** 작업 폴더 글 본문(frontmatter 뺀 것)을 핸디 리뷰 본문으로 바꾼다. 코드 블록과 인라인 코드는 건드리지 않는다. */
export function noteBodyToReview(body: string, ctx: ConvertContext): ConvertResult {
  const warnings: string[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let first = true;
  for (const line of lines) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const mark = fenceMatch[1]![0]!;
      if (fence === null) fence = mark;
      else if (mark === fence) fence = null;
      out.push(line);
      first = false;
      continue;
    }
    if (fence !== null) { out.push(line); continue; }
    if (first && line.trim()) {
      first = false;
      const h1 = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
      if (h1 && isTitleHeading(h1[1] ?? "", ctx.title)) continue;
    }
    let next = line.replace(BLOCK_ID, "");
    const callout = CALLOUT.exec(next);
    if (callout) {
      const title = callout[3]?.trim();
      if (!title) continue;
      next = `${callout[1]}**${title}**`;
    }
    // 인라인 코드(`...`) 안은 그대로 둔다.
    next = next.split(/(`[^`\n]*`)/).map((part, i) => (i % 2 === 1 ? part : convertInline(part, ctx, warnings))).join("");
    out.push(next);
  }
  return { body: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", warnings };
}

/** 리뷰 글의 frontmatter 전체를 만든다. */
export function reviewFrontmatterOf(meta: ReviewMeta, title: string, tags: string[], date: string, cover: string | undefined): ReviewFrontmatter {
  return {
    title, category: meta.category, rating: meta.rating, verdict: meta.verdict.trim(), target: meta.target.trim(),
    pros: meta.pros, cons: meta.cons, links: meta.links, tags, date,
    ...(meta.price?.trim() ? { price: meta.price.trim() } : {}),
    ...(cover ? { cover } : {}),
    ...(meta.featured ? { featured: true } : {}),
    ...(meta.category === "place" && meta.address?.trim() ? { address: meta.address.trim() } : {}),
    ...(meta.category === "place" && meta.mapUrl?.trim() ? { mapUrl: meta.mapUrl.trim() } : {}),
    ...(meta.category === "place" && meta.visitedAt?.trim() ? { visitedAt: meta.visitedAt.trim() } : {}),
    ...(meta.category === "video" && meta.youtubeId?.trim() ? { youtubeId: meta.youtubeId.trim() } : {}),
  };
}

/** 핸디 리뷰 글 → 작업 폴더 글의 review 정보 (가져오기) */
export function metaFromReview(fm: ReviewFrontmatter, path: string): ReviewMeta {
  const meta: ReviewMeta = {
    ...defaultReviewMeta(fm.category),
    rating: fm.rating, verdict: fm.verdict, target: fm.target, pros: fm.pros, cons: fm.cons, links: fm.links,
    slug: slugOfReviewPath(path), date: fm.date, published: path,
  };
  for (const key of ["price", "cover", "address", "mapUrl", "visitedAt", "youtubeId"] as const) if (fm[key]) meta[key] = fm[key];
  if (fm.featured) meta.featured = true;
  return meta;
}

/** 핸디 리뷰 본문 → 작업 폴더 글 본문. 상대 경로 이미지는 가져온 첨부 이름으로, [[slug]]는 가져온 글 이름으로 바꾼다. */
export function reviewBodyToNote(body: string, ctx: { image: (rel: string) => string | null; noteName: (slug: string) => string | null }): string {
  return body
    .replace(MD_IMAGE, (whole, alt: string, rawTarget: string) => {
      const target = decodeMarkdownTarget(rawTarget);
      if (isRemoteUrl(target)) return whole;
      const name = ctx.image(target);
      return name ? `![[${name}${alt ? `|${alt}` : ""}]]` : whole;
    })
    .replace(WIKI_LINK, (whole, inside: string) => {
      const [slug = "", ...rest] = inside.split("|");
      const name = ctx.noteName(slug.trim());
      if (!name) return rest.join("|").trim() || slug.trim();
      const label = rest.join("|").trim();
      return label && label !== name ? `[[${name}|${label}]]` : `[[${name}]]`;
    });
}

export { today };
