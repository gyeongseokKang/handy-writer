/** 핸디 리뷰 저장소(gyeongseokKang/handy-review)의 글 형식과 배포 상태 비교. main·renderer 양쪽에서 쓴다. */

export const REVIEW_CATEGORIES = ["baby", "book", "tech", "place", "video", "etc"] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  baby: "육아용품", book: "책", tech: "전자기기", place: "장소", video: "유튜브 영상", etc: "기타",
};

export interface ReviewLink { label: string; url: string; affiliate: boolean }

// ── 책·소설 고정 필드 (handy-review src/content.config.ts 와 같게 유지) ──
export const BOOK_TYPES = ["일반", "소설", "개발"] as const;
export type BookType = (typeof BOOK_TYPES)[number];
export const NOVEL_LENGTHS = ["단편", "중편", "장편"] as const;
export type NovelLength = (typeof NOVEL_LENGTHS)[number];
export const NOVEL_STATUSES = ["완결", "연재중", "연재중단"] as const;
export type NovelStatus = (typeof NOVEL_STATUSES)[number];
export const NOVEL_GENRES = ["정통무협", "신무협", "선협", "판타지", "현대판타지", "로판", "대체역사", "SF", "로맨스", "기타"] as const;
export type NovelGenre = (typeof NOVEL_GENRES)[number];
/** 1화 ≈ 5,000자. 단편 <100 · 중편 100–299 · 장편 300+ */
export const lengthOf = (episodes: number): NovelLength => (episodes < 100 ? "단편" : episodes < 300 ? "중편" : "장편");
/** 소설 리뷰에서 태그로 쓰면 안 되는 말 (고정 필드로 쓴다) */
export const NOVEL_RESERVED_TAGS: readonly string[] = [...NOVEL_LENGTHS, ...NOVEL_STATUSES, ...NOVEL_GENRES, "미완결", "무협"];

/** 소설 세력 구도 (3~6개, 첫 세력이 주인공 쪽) */
export interface ReviewFaction { name: string; alignment: string; members: string[]; description: string }
/** 플랫폼별 표지 (2장 이상이면 사이트에서 겹친 스택) */
export interface ReviewCover { src: string; platform?: string }

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
  /** 책·소설: 작가 (사이트에서 같은 작가의 다른 작품을 묶는다) */
  author?: string;
  /** 책·소설: 출판사 */
  publisher?: string;
  /** 마지막으로 내용을 바꿔 다시 게시한 날 (YYYY-MM-DD) */
  updated?: string;
  /** 시리즈 이름. 같은 이름끼리 사이트에서 한 묶음 */
  series?: string;
  /** 시리즈 안 순서 */
  seriesOrder?: number;
  /** 한줄평 카피 (목록 카드 인용구). 소설은 필수 */
  oneLiner?: string;
  /** 책 필수: 하위 분류 */
  bookType?: BookType;
  /** 소설 필수: 화수·분량·연재 상태·장르 */
  episodes?: number;
  length?: NovelLength;
  status?: NovelStatus;
  genre?: NovelGenre;
  factions?: ReviewFaction[];
  covers?: ReviewCover[];
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
      const items = k === "links"
        ? (v as ReviewLink[]).filter((l) => l.url.trim())
        : v.some((x) => x && typeof x === "object")
          ? v // 세력·표지처럼 객체 목록은 그대로 둔다
          : (v as string[]).map((s) => String(s).trim()).filter(Boolean);
      if (items.length === 0 && (k === "factions" || k === "covers")) continue;
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
/** 배포 확인 방식. 둘 다 사이트의 /version.json(sha) 을 읽을 뿐, 배포를 일으키지 않는다. */
export type DeployProviderKind = "vercel-version-json" | "cloudflare-version-json";
export interface DeployProviderInfo { kind: DeployProviderKind; siteUrl: string }
export const DEFAULT_DEPLOY_KIND: DeployProviderKind = "cloudflare-version-json";
export const DEFAULT_REVIEW_SITE_URL = "https://review.handykang.com";

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
  /** 사이트 version.json의 빌드 시각 (있을 때만) */
  deployedAt?: string | null;
  checkedAt: string;
  message: string;
}

const same = (a: string | null, b: string | null) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));

/**
 * localAhead: 이 컴퓨터에만 있는(원격에 안 올린) 커밋 수. 모르면(옛 호출) 로컬과 원격이 다르기만 해도 푸시 안 함으로 본다.
 * 로컬이 원격보다 뒤처지기만 한 경우(받을 커밋만 있음)는 푸시할 게 없으니 원격과 배포본으로 판단한다.
 */
export function decideDeployState(input: { deployedSha: string | null; remoteSha: string | null; localSha: string | null; behindBy?: number | null; localAhead?: number | null; error?: string }): Omit<DeployStatus, "checkedAt"> {
  const { deployedSha, remoteSha, localSha } = input;
  const base = { deployedSha, remoteSha, localSha, behindBy: input.behindBy ?? null };
  const unpushed = typeof input.localAhead === "number" ? input.localAhead > 0 : !!(localSha && remoteSha && !same(localSha, remoteSha));
  if (unpushed) return { ...base, state: "unpushed", message: "아직 게시(푸시)하지 않은 커밋이 있어요." };
  if (!deployedSha) return { ...base, state: "unknown", message: input.error ?? "배포된 버전을 알 수 없어요." };
  if (same(deployedSha, remoteSha ?? localSha)) return { ...base, state: "up-to-date", message: "사이트가 최신 커밋으로 배포돼 있어요." };
  return { ...base, state: "deploy-needed", message: "사이트가 최신 커밋보다 뒤처져 있어요. 배포가 필요해요." };
}

/** 사이드바 저장소 목록에 보여 줄 핸디 리뷰 저장소 상태 */
export interface ReviewRepoStatus {
  repo: string;
  /** 폴더 이름 */
  name: string;
  branch: string | null;
  ahead: number;
  behind: number;
  /** 커밋 안 한 변경 수 */
  changes: number;
  error?: string;
}

/* ───────── 배포 대시보드 ───────── */

/**
 * 대시보드의 글 하나의 상태.
 *  draft: 작업 폴더에만 있고 아직 게시 안 함
 *  blocked: 게시하려 해도 고칠 것이 있음 (필수 항목 빠짐 등)
 *  changed: 게시한 뒤 글을 고쳤는데 아직 다시 게시 안 함
 *  unpushed: 저장소에는 썼지만 원격에 안 올라감 (커밋 안 했거나 푸시 안 함)
 *  pending: 원격에는 올라갔지만 사이트가 아직 그 커밋으로 배포 안 됨
 *  live: 사이트에 반영됨
 *  published: 원격에 있음 (사이트 배포 버전을 몰라 반영 여부는 모름)
 */
export type DashboardPostState = "draft" | "blocked" | "changed" | "unpushed" | "pending" | "live" | "published";

export const DASHBOARD_POST_LABEL: Record<DashboardPostState, string> = {
  draft: "게시 안 함",
  blocked: "게시 막힘",
  changed: "수정 후 미게시",
  unpushed: "푸시 안 됨",
  pending: "반영 대기",
  live: "반영됨",
  published: "게시됨",
};

export interface ReviewDashboardPost {
  title: string;
  category: ReviewCategory | null;
  /** 연결된 작업 폴더 글. 저장소에만 있는 글이면 null */
  notePath: string | null;
  /** 저장소 안 리뷰 글 경로. 아직 게시 안 했으면 null */
  postPath: string | null;
  slug: string | null;
  state: DashboardPostState;
  /** 게시를 막는 문제 */
  problems: string[];
  /** 원격 main에서 이 글을 마지막으로 바꾼 커밋 */
  commitSha: string | null;
  commitDate: string | null;
}

export type BuildResult = "success" | "failure" | "pending";

export interface ReviewDashboardCommit {
  sha: string;
  subject: string;
  date: string;
  /** 사이트에 배포된 커밋(또는 그 이전)인지. 배포 버전을 모르면 null */
  deployed: boolean | null;
  /** GitHub에 올라온 빌드 결과 (gh로 읽을 수 있을 때만) */
  build: BuildResult | null;
  buildUrl: string | null;
}

export interface ReviewDashboard {
  status: DeployStatus;
  siteUrl: string | null;
  commits: ReviewDashboardCommit[];
  posts: ReviewDashboardPost[];
  /** 빌드 결과를 읽은 방법. gh가 없거나 로그인 안 했으면 unavailable */
  buildCheck: "gh" | "unavailable";
}

export function dashboardPostState(input: {
  hasNote: boolean;
  /** 저장소에 리뷰 글 파일이 있는지 */
  inRepo: boolean;
  problems: number;
  /** 작업 폴더 글로 다시 만든 리뷰가 저장소 파일과 다른지 */
  differs: boolean;
  /** 원격 main에 이 글을 바꾼 커밋이 있고, 그 뒤로 이 컴퓨터에서 바꾼 것이 없는지 */
  onRemote: boolean;
  /** 원격의 마지막 커밋이 배포됐는지. 배포 버전을 모르면 null */
  deployed: boolean | null;
}): DashboardPostState {
  if (input.hasNote && !input.inRepo) return input.problems > 0 ? "blocked" : "draft";
  if (input.hasNote && input.differs) return input.problems > 0 ? "blocked" : "changed";
  if (!input.onRemote) return "unpushed";
  if (input.deployed === null) return "published";
  return input.deployed ? "live" : "pending";
}

/** GitHub check-run 목록 → 빌드 결과 하나. 하나라도 실패면 실패, 하나라도 도는 중이면 진행 중. */
export function summarizeChecks(runs: { status?: string | null; conclusion?: string | null; html_url?: string | null; details_url?: string | null }[]): { build: BuildResult; url: string | null } | null {
  if (runs.length === 0) return null;
  const urlOf = (r: (typeof runs)[number]) => r.details_url || r.html_url || null;
  const failed = runs.find((r) => r.status === "completed" && ["failure", "timed_out", "cancelled", "action_required", "startup_failure"].includes(r.conclusion ?? ""));
  if (failed) return { build: "failure", url: urlOf(failed) };
  const running = runs.find((r) => r.status !== "completed");
  if (running) return { build: "pending", url: urlOf(running) };
  return { build: "success", url: urlOf(runs[0]!) };
}

/** git remote 주소 → GitHub owner/repo */
export function parseGitHubRemote(url: string): { owner: string; repo: string } | null {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? { owner: m[1]!, repo: m[2]! } : null;
}
