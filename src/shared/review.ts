/** 핸디 리뷰 저장소(gyeongseokKang/handy-review)의 글 형식과 배포 상태 비교. main·renderer 양쪽에서 쓴다. */

export const REVIEW_CATEGORIES = ["baby", "book", "tech", "place", "video", "etc"] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  baby: "육아용품", book: "책", tech: "전자기기", place: "장소", video: "유튜브 영상", etc: "기타",
};

export interface ReviewLink { label: string; url: string; affiliate: boolean }

export interface ReviewFrontmatter {
  title: string;
  category: ReviewCategory;
  rating: number;
  verdict: string;
  pros: string[];
  cons: string[];
  target: string;
  price?: string;
  links: ReviewLink[];
  cover?: string;
  date: string; // YYYY-MM-DD
  tags: string[];
  featured?: boolean;
  address?: string;
  mapUrl?: string;
  visitedAt?: string;
  youtubeId?: string;
}

export interface ReviewPost { path: string; frontmatter: ReviewFrontmatter; body: string }
export interface ReviewPostSummary { path: string; title: string; category: ReviewCategory; date: string }

/** 저장소 안 글 위치: src/content/reviews/<category>/<date>-<slug>.md */
export const REVIEWS_DIR = "src/content/reviews";
export const reviewPostPath = (category: ReviewCategory, date: string, slug: string) => `${REVIEWS_DIR}/${category}/${date}-${slug}.md`;
/** 글 옆 이미지 폴더: <date>-<slug>/ (Astro가 마크다운 상대경로 이미지를 빌드 때 처리한다) */
export const reviewAssetDir = (postPath: string) => postPath.replace(/\.md$/, "");

export function slugify(input: string) {
  const s = input.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return s || `review-${Date.now().toString(36)}`;
}

export const today = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

export function reviewTemplate(category: ReviewCategory, title: string, date = today()): ReviewPost {
  const frontmatter: ReviewFrontmatter = {
    title, category, rating: 4, verdict: "", pros: [], cons: [], target: "", links: [], date, tags: [],
    ...(category === "place" ? { address: "", visitedAt: date } : {}),
    ...(category === "video" ? { youtubeId: "" } : {}),
  };
  const body = category === "place"
    ? "## 어떤 곳인가\n\n## 가보니\n\n## 결론\n"
    : category === "video"
      ? "## 한 줄 요약\n\n## 볼 만한 부분\n\n## 결론\n"
      : "## 왜 골랐나\n\n## 써보니\n\n## 결론\n";
  return { path: reviewPostPath(category, date, slugify(title)), frontmatter, body };
}

/** 빈 값은 빼고 저장한다(스키마에서 선택 항목이 빈 문자열이면 url 검사에 걸린다). */
export function cleanFrontmatter(fm: ReviewFrontmatter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v)) {
      const items = k === "links" ? (v as ReviewLink[]).filter((l) => l.url.trim()) : (v as string[]).map((s) => s.trim()).filter(Boolean);
      out[k] = items;
      continue;
    }
    out[k] = v;
  }
  out["rating"] = Math.max(0, Math.min(5, Math.round(Number(fm.rating) * 2) / 2));
  return out;
}

// ── 배포 상태 ──────────────────────────────────────────────

/** 배포된 사이트가 몇 번 커밋으로 빌드됐는지 알려 주는 곳. 지금은 Vercel 사이트의 /version.json 하나. */
export interface DeployProviderInfo { kind: "vercel-version-json"; siteUrl: string }

export type DeployState =
  | "up-to-date" // 배포된 커밋 = 원격 main 최신
  | "deploy-needed" // 원격 main이 배포본보다 앞섬 → Vercel 빌드 대기/실패/미연결
  | "unpushed" // 로컬에 아직 푸시 안 한 커밋이 있음 → 먼저 게시
  | "unknown"; // 사이트 주소가 없거나 version.json을 못 읽음

export interface DeployStatus {
  state: DeployState;
  deployedSha: string | null;
  remoteSha: string | null;
  localSha: string | null;
  /** 원격 main이 배포본보다 몇 커밋 앞서는지. 모르면 null */
  behindBy: number | null;
  checkedAt: string;
  message: string;
}

const same = (a: string | null, b: string | null) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

export function decideDeployState(input: { deployedSha: string | null; remoteSha: string | null; localSha: string | null; behindBy?: number | null; error?: string }): Omit<DeployStatus, "checkedAt"> {
  const { deployedSha, remoteSha, localSha } = input;
  const base = { deployedSha, remoteSha, localSha, behindBy: input.behindBy ?? null };
  if (localSha && remoteSha && !same(localSha, remoteSha)) return { ...base, state: "unpushed", message: "아직 게시(푸시)하지 않은 커밋이 있어요." };
  if (!deployedSha) return { ...base, state: "unknown", message: input.error ?? "배포된 버전을 알 수 없어요." };
  if (same(deployedSha, remoteSha ?? localSha)) return { ...base, state: "up-to-date", message: "사이트가 최신 커밋으로 배포돼 있어요." };
  return { ...base, state: "deploy-needed", message: "사이트가 최신 커밋보다 뒤처져 있어요. 배포가 필요해요." };
}
