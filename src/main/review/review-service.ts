import { app } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import { Document, isSeq, parse, visit } from "yaml";

import {
  DEFAULT_DEPLOY_KIND, DEFAULT_REVIEW_SITE_URL, REVIEW_CATEGORIES, REVIEWS_DIR, cleanFrontmatter, decideDeployState, reviewAssetDir, reviewTemplate,
  type DeployProviderInfo, type DeployStatus, type ReviewCategory, type ReviewFrontmatter, type ReviewLink, type ReviewPost, type ReviewPostSummary,
} from "../../shared/review";
import { runGit } from "../git/runner";
import { parseStatusV2 } from "../git/parse";
import type { ReviewRepoStatus } from "../../shared/review";
import { createDeployProvider } from "./deploy";

export interface ReviewConfig { repo: string | null; deploy: DeployProviderInfo | null }

const configPath = () => join(app.getPath("userData"), "review-config.json");
const toPosix = (p: string) => p.split(sep).join("/");

/** 사이트 주소를 아직 안 넣었으면 핸디 리뷰 기본 주소로 배포 상태를 본다. */
const DEFAULT_DEPLOY: DeployProviderInfo = { kind: DEFAULT_DEPLOY_KIND, siteUrl: DEFAULT_REVIEW_SITE_URL };

export async function loadReviewConfig(): Promise<ReviewConfig> {
  let saved: Partial<ReviewConfig> = {};
  try { saved = JSON.parse(await readFile(configPath(), "utf8")) as Partial<ReviewConfig>; } catch { /* 처음 */ }
  return { repo: saved.repo ?? null, deploy: saved.deploy?.siteUrl ? saved.deploy : DEFAULT_DEPLOY };
}
export async function saveReviewConfig(next: ReviewConfig) {
  await mkdir(dirname(configPath()), { recursive: true });
  await writeFile(configPath(), JSON.stringify(next, null, 2));
  return next;
}

export async function checkReviewRepo(repo: string) {
  if (!existsSync(join(repo, "src", "content.config.ts")) && !existsSync(join(repo, REVIEWS_DIR))) {
    throw new Error("핸디 리뷰 저장소가 아니에요. src/content/reviews 폴더가 있는 폴더를 골라 주세요.");
  }
}

/** 저장소 밖 경로로 빠져나가지 못하게 막는다. */
function inside(repo: string, rel: string) {
  const abs = join(repo, rel);
  if (relative(repo, abs).startsWith("..")) throw new Error("저장소 밖 경로예요.");
  return abs;
}

/** 사이트 글들이 쓰는 항목 순서. 여기 없는 항목은 뒤에 붙는다. */
const FIELD_ORDER = [
  "title", "author", "category", "bookType", "episodes", "length", "status", "genre", "rating", "verdict", "oneLiner", "factions",
  "pros", "cons", "links", "cover", "covers", "target", "publisher", "price", "address", "mapUrl", "visitedAt", "youtubeId",
  "series", "seriesOrder", "date", "updated", "tags", "featured",
];
/** 짧은 문자열 목록은 한 줄로 쓴다 (tags: [a, b], members: [a, b]) — 사이트에서 손으로 쓴 글과 모양을 맞춘다. */
const FLOW_KEYS = new Set(["tags", "members"]);

export function serializePost(fm: ReviewFrontmatter, body: string) {
  const clean = cleanFrontmatter(fm);
  // 기본값과 같은 값은 빼서 사이트 글과 같은 모양으로 (affiliate: false, members: [])
  if (Array.isArray(clean["links"])) clean["links"] = (clean["links"] as ReviewLink[]).map(({ affiliate, ...l }) => (affiliate ? { ...l, affiliate } : l));
  if (Array.isArray(clean["factions"])) {
    // 항목 순서(name, alignment, members, description)는 그대로 두고 빈 members만 뺀다.
    clean["factions"] = (clean["factions"] as Record<string, unknown>[]).map((f) =>
      Object.fromEntries(Object.entries(f).filter(([k, v]) => !(k === "members" && Array.isArray(v) && v.length === 0))));
  }
  const rank = (k: string) => { const i = FIELD_ORDER.indexOf(k); return i === -1 ? FIELD_ORDER.length : i; };
  const ordered = Object.fromEntries(Object.entries(clean).sort(([a], [b]) => rank(a) - rank(b)));
  const doc = new Document(ordered);
  visit(doc, { Pair(_, pair) {
    const key = String((pair.key as { value?: unknown })?.value ?? "");
    if (FLOW_KEYS.has(key) && isSeq(pair.value)) pair.value.flow = true;
    return undefined;
  } });
  return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${body.trim()}\n`;
}

export function parsePost(path: string, text: string): ReviewPost {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const raw = (m ? parse(m[1]) : {}) as Record<string, unknown>;
  const date = raw["date"] instanceof Date ? (raw["date"] as Date).toISOString().slice(0, 10) : String(raw["date"] ?? "");
  const tpl = reviewTemplate((raw["category"] as ReviewCategory) ?? "etc", String(raw["title"] ?? ""), date).frontmatter;
  const fm = { ...tpl, ...raw, date } as ReviewFrontmatter;
  if (fm.visitedAt && typeof fm.visitedAt !== "string") fm.visitedAt = new Date(fm.visitedAt as unknown as string).toISOString().slice(0, 10);
  fm.links = (fm.links ?? []).map((l) => ({ label: l.label ?? "", url: l.url ?? "", affiliate: !!l.affiliate }));
  return { path, frontmatter: fm, body: (m ? m[2] : text).replace(/^\n+/, "") };
}

export async function listPosts(repo: string): Promise<ReviewPostSummary[]> {
  const out: ReviewPostSummary[] = [];
  for (const category of REVIEW_CATEGORIES) {
    const dir = join(repo, REVIEWS_DIR, category);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".md")) continue;
      const path = `${REVIEWS_DIR}/${category}/${name}`;
      const post = parsePost(path, await readFile(join(dir, name), "utf8"));
      out.push({ path, title: post.frontmatter.title, category, date: post.frontmatter.date });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function createPost(repo: string, category: ReviewCategory, title: string): Promise<ReviewPost> {
  const post = reviewTemplate(category, title);
  const abs = inside(repo, post.path);
  if (existsSync(abs)) throw new Error("같은 날짜·제목의 리뷰가 이미 있어요.");
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, serializePost(post.frontmatter, post.body));
  return post;
}

export async function readPost(repo: string, path: string) {
  return parsePost(path, await readFile(inside(repo, path), "utf8"));
}

export async function writePost(repo: string, post: ReviewPost) {
  await writeFile(inside(repo, post.path), serializePost(post.frontmatter, post.body));
}

/** 붙여넣은 이미지를 글 옆 폴더(<date>-<slug>/)에 복사하고 본문에 넣을 상대경로를 돌려준다. */
export async function saveImage(repo: string, postPath: string, name: string, data: Uint8Array) {
  const dirRel = reviewAssetDir(postPath);
  const dir = inside(repo, dirRel);
  await mkdir(dir, { recursive: true });
  const ext = extname(name).toLowerCase() || ".png";
  const stem = basename(name, extname(name)).replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "image";
  let file = `${stem}${ext}`;
  for (let i = 2; existsSync(join(dir, file)); i++) file = `${stem}-${i}${ext}`;
  await writeFile(join(dir, file), data);
  return `./${basename(dirRel)}/${file}`;
}

/** 글과 이미지 폴더만 커밋하고 main에 푸시한다. 다른 변경은 건드리지 않는다. */
export async function publishPost(repo: string, postPath: string) {
  const { frontmatter } = await readPost(repo, postPath);
  const paths = [postPath];
  if (existsSync(inside(repo, reviewAssetDir(postPath)))) paths.push(reviewAssetDir(postPath));
  await runGit(repo, ["add", "--", ...paths]);
  const staged = (await runGit(repo, ["diff", "--cached", "--name-only", "--", ...paths])).stdout.trim();
  if (staged) await runGit(repo, ["commit", "-m", `리뷰: ${frontmatter.title}`, "--", ...paths]);
  await runGit(repo, ["pull", "--rebase", "--autostash"], { timeoutMs: 60_000 });
  await runGit(repo, ["push"], { timeoutMs: 60_000 });
  const sha = (await runGit(repo, ["rev-parse", "HEAD"], { readOnly: true })).stdout.trim();
  return { committed: !!staged, sha };
}

/** 배포된 커밋(사이트 version.json)과 로컬·원격 main 최신 커밋을 비교한다. 배포를 일으키지는 않는다. */
export async function deployStatus(repo: string, info: DeployProviderInfo | null): Promise<DeployStatus> {
  const git = async (args: string[]) => { try { return (await runGit(repo, args, { readOnly: true, timeoutMs: 30_000 })).stdout.trim(); } catch { return null; } };
  await git(["fetch", "--quiet", "origin"]);
  const localSha = await git(["rev-parse", "HEAD"]);
  const remoteSha = await git(["rev-parse", "@{upstream}"]);
  let deployedSha: string | null = null;
  let deployedAt: string | null = null;
  let error: string | undefined;
  const provider = createDeployProvider(info);
  if (!provider) error = "사이트 주소를 넣으면 배포 상태를 확인해요.";
  else {
    try { ({ sha: deployedSha, builtAt: deployedAt } = await provider.deployed()); } catch (e) { error = `배포 버전을 못 읽었어요: ${(e as Error).message}`; }
  }
  let behindBy: number | null = null;
  if (deployedSha && remoteSha) {
    const n = await git(["rev-list", "--count", `${deployedSha}..${remoteSha}`]);
    behindBy = n === null ? null : Number(n);
  }
  // 이 컴퓨터에만 있는 커밋 수 (받을 커밋만 있는 '뒤처짐'은 푸시 안 함이 아니다)
  const ahead = await git(["rev-list", "--count", "@{upstream}..HEAD"]);
  const localAhead = ahead === null ? null : Number(ahead);
  return { ...decideDeployState({ deployedSha, remoteSha, localSha, behindBy, localAhead, error }), deployedAt, checkedAt: new Date().toISOString() };
}

export const toRepoRelative = (repo: string, abs: string) => toPosix(relative(repo, abs));

/** 사이드바에 보여 줄 리뷰 저장소의 Git 상태. 원격을 받아 오지는 않는다(배포 상태 확인이 받아 온다). */
export async function reviewRepoStatus(repo: string): Promise<ReviewRepoStatus> {
  const name = basename(repo);
  try {
    const parsed = parseStatusV2((await runGit(repo, ["status", "--porcelain=v2", "--branch", "-z"], { readOnly: true })).stdout);
    return { repo, name, branch: parsed.branch, ahead: parsed.ahead, behind: parsed.behind, changes: parsed.changes.length };
  } catch (error) {
    return { repo, name, branch: null, ahead: 0, behind: 0, changes: 0, error: (error as Error).message };
  }
}

/**
 * 원격의 새 커밋을 받는다(빨리 감기만). 이 컴퓨터에 따로 만든 커밋이 있어 갈라졌으면 건드리지 않고 알린다.
 * 커밋 안 한 변경은 잠깐 치웠다가 되돌린다(--autostash).
 */
export async function pullReviewRepo(repo: string) {
  await runGit(repo, ["pull", "--ff-only", "--autostash"], { timeoutMs: 60_000 });
  return reviewRepoStatus(repo);
}
