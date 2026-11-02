import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, posix, relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { listAttachments, importFiles } from "../attachments";
import { listNotes, readNote, resolveInside, writeNote, createNote } from "../notes-fs";
import { runGit } from "../git/runner";
import { readPost, serializePost } from "./review-service";
import { resolveAttachment, isRemoteUrl } from "../../shared/attachments";
import { splitFrontmatter } from "../../shared/frontmatter";
import { extractSection, splitEmbedTarget } from "../../shared/note-section";
import { reviewAssetDir, today } from "../../shared/review";
import {
  metaFromReview, noteBodyToReview, readReviewMeta, reviewBodyToNote, reviewFrontmatterOf, reviewPathFor, reviewProblems,
  reviewSlugOf, slugOfReviewPath, writeReviewMeta, type ReviewMeta, type ReviewNotePreview, type ReviewNotePublishResult, type ReviewSeriesEntry,
} from "../../shared/review-note";
import type { NoteMeta } from "../../shared/types";

export const REVIEW_NOTE_FOLDER = "리뷰";

interface Plan extends ReviewNotePreview {
  meta: ReviewMeta;
  /** 원본 절대 경로 → 저장소 기준 상대 경로 */
  copies: { from: string; to: string }[];
}

const stemOf = (path: string) => basename(path, extname(path));

function frontmatterTags(frontmatter: string): string[] {
  try {
    const data = parseYaml(frontmatter.replace(/^---[ \t]*\r?\n/, "").replace(/(?:\r?\n)?---[ \t]*\r?\n?$/, "")) as Record<string, unknown> | null;
    const raw = data?.["tags"] ?? data?.["tag"];
    const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
    return list.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** 사이트 빌드에서 경로 문제가 없게 파일 이름은 영문·숫자로 만든다. */
function assetFileName(name: string, used: Set<string>) {
  const ext = extname(name).toLowerCase() || ".png";
  const stem = stemOf(name).normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "image";
  let file = `${stem}${ext}`;
  for (let i = 2; used.has(file); i++) file = `${stem}-${i}${ext}`;
  used.add(file);
  return file;
}

async function planPublish(root: string, repo: string, notePath: string): Promise<Plan> {
  const raw = await readNote(root, notePath);
  const { frontmatter, body } = splitFrontmatter(raw);
  const meta = readReviewMeta(frontmatter);
  if (!meta) throw new Error("이 글에는 리뷰 정보가 없어요. 오른쪽 '리뷰' 탭에서 리뷰로 만들어 주세요.");
  const title = stemOf(notePath);
  const date = meta.date?.trim() || today();
  const slug = reviewSlugOf(meta, title);
  const path = reviewPathFor(meta, title, date);
  const replaces = meta.published && meta.published !== path ? meta.published : null;
  if (path !== meta.published && existsSync(resolveInside(repo, path))) {
    throw new Error(`저장소에 같은 주소의 리뷰가 이미 있어요: ${path}\n리뷰 탭에서 주소(slug)를 바꿔 주세요.`);
  }

  const [attachments, notes] = await Promise.all([listAttachments(root), listNotes(root)]);
  const noteFolder = dirname(notePath) === "." ? "" : dirname(notePath);
  const assetDir = reviewAssetDir(path);
  const used = new Set<string>();
  const byFile = new Map<string, string>();
  const copies: Plan["copies"] = [];
  const asset = (target: string) => {
    const found = resolveAttachment(attachments, target, noteFolder);
    if (!found) return null;
    let file = byFile.get(found.path);
    if (!file) {
      file = assetFileName(found.name, used);
      byFile.set(found.path, file);
      copies.push({ from: resolveInside(root, found.path), to: `${assetDir}/${file}` });
    }
    return `./${posix.basename(assetDir)}/${file}`;
  };

  const findNote = (name: string): NoteMeta | undefined => notes.find((n) => n.name.toLowerCase() === name.toLowerCase());
  const noteCache = new Map<string, string | null>();
  const readOther = async (n: NoteMeta) => {
    if (!noteCache.has(n.path)) noteCache.set(n.path, await readNote(root, n.path).catch(() => null));
    return noteCache.get(n.path) ?? null;
  };
  // 링크·끼워 넣기 대상 글은 미리 읽어 둔다 (바꾸는 함수는 동기라서).
  const linked = new Set([...body.matchAll(/\[\[([^\]|#^\n]+)/g)].map((m) => m[1]!.trim()));
  for (const name of linked) { const n = findNote(name); if (n) await readOther(n); }

  const linkSlug = (name: string) => {
    const n = findNote(name);
    const other = n ? noteCache.get(n.path) : null;
    const published = other ? readReviewMeta(splitFrontmatter(other).frontmatter)?.published : null;
    return published ? slugOfReviewPath(published) : null;
  };
  const embedNote = (target: string) => {
    const { name, heading } = splitEmbedTarget(target);
    const n = findNote(name);
    const other = n ? noteCache.get(n.path) : null;
    if (!n || !other) return null;
    const otherBody = splitFrontmatter(other).body;
    const part = heading ? extractSection(otherBody, heading) : otherBody;
    if (part === null) return null;
    // 끼워 넣은 글 안의 끼워 넣기는 펼치지 않는다(돌고 도는 것을 막는다).
    return noteBodyToReview(part, { title: n.name, asset, linkSlug }).body.trim();
  };

  const converted = noteBodyToReview(body, { title, asset, linkSlug, embedNote });
  const warnings = [...converted.warnings];

  let cover: string | undefined;
  if (meta.cover?.trim()) {
    const c = meta.cover.trim();
    if (isRemoteUrl(c) || c.startsWith("/")) cover = c;
    else {
      const found = resolveAttachment(attachments, c, noteFolder);
      if (!found) warnings.push(`커버 이미지를 찾지 못했어요: ${c}`);
      else {
        const file = `cover${extname(found.name).toLowerCase() || ".png"}`;
        copies.push({ from: resolveInside(root, found.path), to: `public/images/reviews/${slug}/${file}` });
        cover = `/images/reviews/${slug}/${file}`;
      }
    }
  }

  const fm = reviewFrontmatterOf(meta, title, frontmatterTags(frontmatter), date, cover);
  return { path, slug, date, markdown: serializePost(fm, converted.body), warnings, replaces, meta: { ...meta, slug, date, published: path }, copies };
}

export async function previewNoteReview(root: string, repo: string, notePath: string): Promise<ReviewNotePreview> {
  const { path, slug, date, markdown, warnings, replaces } = await planPublish(root, repo, notePath);
  return { path, slug, date, markdown, warnings, replaces };
}

async function tracked(repo: string, path: string) {
  try { return (await runGit(repo, ["ls-files", "--", path], { readOnly: true })).stdout.trim() !== ""; } catch { return false; }
}

/**
 * 글을 리뷰 글로 바꿔 저장소에 쓰고, 그 글과 이미지만 커밋해 푸시한다. 다른 변경은 건드리지 않는다.
 * 푸시하면 사이트(Cloudflare/Vercel)가 저절로 다시 빌드한다. 글 frontmatter는 renderer가 결과로 고친다.
 */
export async function publishNoteReview(root: string, repo: string, notePath: string): Promise<ReviewNotePublishResult> {
  const plan = await planPublish(root, repo, notePath);
  const problems = reviewProblems(plan.meta);
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const assetDir = reviewAssetDir(plan.path);
  const touched = new Set([plan.path, assetDir]);
  // 글 옆 이미지 폴더는 매번 새로 채워서 본문에서 뺀 이미지가 남지 않게 한다.
  await rm(resolveInside(repo, assetDir), { recursive: true, force: true });
  if (plan.replaces) {
    await rm(resolveInside(repo, plan.replaces), { force: true });
    await rm(resolveInside(repo, reviewAssetDir(plan.replaces)), { recursive: true, force: true });
    touched.add(plan.replaces).add(reviewAssetDir(plan.replaces));
  }
  for (const { from, to } of plan.copies) {
    const abs = resolveInside(repo, to);
    await mkdir(dirname(abs), { recursive: true });
    await copyFile(from, abs);
    touched.add(to.startsWith("public/") ? posix.dirname(to) : to);
  }
  const abs = resolveInside(repo, plan.path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, plan.markdown);

  const paths: string[] = [];
  for (const p of touched) if (existsSync(resolveInside(repo, p)) || (await tracked(repo, p))) paths.push(p);
  await runGit(repo, ["add", "-A", "--", ...paths]);
  const staged = (await runGit(repo, ["diff", "--cached", "--name-only", "--", ...paths])).stdout.trim();
  const title = stemOf(notePath);
  if (staged) await runGit(repo, ["commit", "-m", `리뷰: ${title}`, "--", ...paths]);
  await runGit(repo, ["pull", "--rebase", "--autostash"], { timeoutMs: 60_000 });
  await runGit(repo, ["push"], { timeoutMs: 60_000 });
  const sha = (await runGit(repo, ["rev-parse", "HEAD"], { readOnly: true })).stdout.trim();
  const { path, slug, date, markdown, warnings, replaces, meta } = plan;
  return { path, slug, date, markdown, warnings, replaces, meta, committed: !!staged, sha };
}

/** 작업 폴더에서 시리즈를 적은 리뷰 글들 (리뷰 칸의 자동완성과 같은 시리즈 목록) */
export async function listReviewSeries(root: string): Promise<ReviewSeriesEntry[]> {
  const out: ReviewSeriesEntry[] = [];
  for (const n of await listNotes(root)) {
    const raw = await readNote(root, n.path).catch(() => "");
    if (!raw.includes("series")) continue;
    const meta = readReviewMeta(splitFrontmatter(raw).frontmatter);
    if (!meta?.series) continue;
    out.push({ series: meta.series, path: n.path, name: n.name, order: meta.seriesOrder ?? null, date: meta.date ?? null, published: !!meta.published });
  }
  return out;
}

/** 저장소의 리뷰 글을 작업 폴더의 `리뷰/` 글로 가져온다. 이미 가져온 글이면 그 글을 돌려준다. */
export async function importReviewToNote(root: string, repo: string, postPath: string): Promise<{ path: string; created: boolean }> {
  const notes = await listNotes(root);
  const metas = new Map<string, ReviewMeta>();
  for (const n of notes) {
    const raw = await readNote(root, n.path).catch(() => "");
    if (!raw.includes("review:")) continue;
    const meta = readReviewMeta(splitFrontmatter(raw).frontmatter);
    if (meta) metas.set(n.path, meta);
  }
  for (const [path, meta] of metas) if (meta.published === postPath) return { path, created: false };

  const post = await readPost(repo, postPath);
  const postDir = dirname(resolveInside(repo, postPath));
  const imageNames = new Map<string, string>();
  for (const m of post.body.matchAll(/!\[[^\]\n]*\]\(([^)\s]+)/g)) {
    const rel = m[1]!;
    if (isRemoteUrl(rel) || imageNames.has(rel)) continue;
    const src = join(postDir, decodeURIComponent(rel));
    if (relative(repo, src).startsWith("..") || !existsSync(src)) continue;
    const { imported } = await importFiles(root, [src]);
    if (imported[0]) imageNames.set(rel, imported[0].name);
  }
  const noteName = (slug: string) => {
    for (const [path, meta] of metas) if (meta.published && slugOfReviewPath(meta.published) === slug) return stemOf(path);
    return null;
  };
  const meta = metaFromReview(post.frontmatter, postPath);
  // 커버가 저장소 public/ 안 파일이면 첨부로 가져온다.
  if (meta.cover?.startsWith("/")) {
    const src = join(repo, "public", meta.cover);
    if (existsSync(src)) {
      const { imported } = await importFiles(root, [src]);
      if (imported[0]) meta.cover = imported[0].name;
    }
  }
  const tags = post.frontmatter.tags.filter(Boolean);
  const frontmatter = writeReviewMeta(tags.length ? `---\n${stringifyYaml({ tags }, { flowCollectionPadding: false })}---\n` : "", meta);
  const body = reviewBodyToNote(post.body, { image: (rel) => imageNames.get(rel) ?? null, noteName });
  const created = await createNote(root, REVIEW_NOTE_FOLDER, post.frontmatter.title || slugOfReviewPath(postPath));
  await writeNote(root, created.path, `${frontmatter}\n${body.trim()}\n`);
  return { path: created.path, created: true };
}
