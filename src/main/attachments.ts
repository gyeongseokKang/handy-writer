import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import {
  ATTACHMENT_DIR,
  isAttachmentPath,
  kindOfPath,
  type AttachmentMeta,
} from "../shared/attachments";
import { resolveInside, sanitizeNoteName, toPosix } from "./notes-fs";

/** 붙여넣거나 끌어다 놓은 파일 한 개의 최대 크기 (IPC로 통째로 넘어오므로 제한한다) */
export const MAX_SAVE_BYTES = 200 * 1024 * 1024;

const IGNORED_DIRS = new Set(["node_modules"]);

async function toMeta(root: string, abs: string): Promise<AttachmentMeta> {
  const info = await stat(abs);
  const rel = toPosix(abs.slice(resolve(root).length + 1));
  return { path: rel, name: basename(rel), kind: kindOfPath(rel), size: info.size, mtime: info.mtimeMs };
}

export async function listAttachments(root: string): Promise<AttachmentMeta[]> {
  const found: AttachmentMeta[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile() && isAttachmentPath(entry.name)) found.push(await toMeta(root, abs));
    }
  }
  await walk(resolve(root));
  return found.sort((a, b) => a.path.localeCompare(b.path, "ko"));
}

/** `이름.png`가 이미 있으면 `이름 1.png`, `이름 2.png`처럼 번호를 붙인 새 경로를 돌려준다. */
async function uniquePath(dir: string, name: string) {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 0; ; i++) {
    const candidate = join(dir, i === 0 ? name : `${stem} ${i}${ext}`);
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
}

function cleanFileName(name: string) {
  const ext = extname(basename(name));
  const stem = sanitizeNoteName(basename(name).slice(0, basename(name).length - ext.length)) || "첨부";
  return `${stem}${ext.toLowerCase()}`;
}

export interface ImportResult {
  imported: AttachmentMeta[];
  /** 지원하지 않는 형식이라 건너뛴 파일 이름 */
  skipped: string[];
}

/** 컴퓨터의 다른 곳에 있는 파일을 작업 폴더의 attachments/ 로 복사한다. 원본은 그대로 둔다. */
export async function importFiles(root: string, sourcePaths: string[]): Promise<ImportResult> {
  const dir = resolveInside(root, ATTACHMENT_DIR);
  await mkdir(dir, { recursive: true });
  const result: ImportResult = { imported: [], skipped: [] };
  for (const source of sourcePaths) {
    const info = await stat(source).catch(() => null);
    if (!info?.isFile() || !isAttachmentPath(source)) {
      result.skipped.push(basename(source));
      continue;
    }
    const target = await uniquePath(dir, cleanFileName(source));
    await copyFile(source, target);
    result.imported.push(await toMeta(root, target));
  }
  return result;
}

/** 붙여넣거나 끌어다 놓은 파일의 내용을 attachments/ 에 저장한다. */
export async function saveAttachment(root: string, name: string, data: Uint8Array): Promise<AttachmentMeta> {
  if (!isAttachmentPath(name)) throw new Error("이미지, 영상, 오디오, PDF 파일만 첨부할 수 있어요.");
  if (data.byteLength > MAX_SAVE_BYTES) throw new Error("파일이 너무 커요 (200MB 이하). '첨부 추가' 버튼으로 파일을 직접 골라 주세요.");
  const dir = resolveInside(root, ATTACHMENT_DIR);
  await mkdir(dir, { recursive: true });
  const target = await uniquePath(dir, cleanFileName(name));
  await writeFile(target, data);
  return toMeta(root, target);
}

/** 프로토콜 주소의 경로를 작업 폴더 안의 첨부 파일 경로로 바꾼다. 폴더 밖이거나 첨부 형식이 아니면 던진다. */
export function resolveAssetFile(root: string, relPath: string) {
  if (!isAttachmentPath(relPath)) throw new Error("첨부 형식이 아니에요.");
  const abs = resolveInside(root, relPath);
  if (dirname(abs).split(/[\\/]/).some((segment) => segment.startsWith(".") && segment !== "." && segment !== "..")) {
    throw new Error("숨김 폴더의 파일은 열 수 없어요.");
  }
  return abs;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  ogv: "video/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  pdf: "application/pdf",
};

export const mimeOf = (path: string) => MIME[extname(path).slice(1).toLowerCase()] ?? "application/octet-stream";

export type ByteRange = { start: number; end: number };

/** `Range: bytes=…` 헤더를 읽는다. 없으면 null, 만족할 수 없으면 "invalid". 영상 되감기(seek)에 필요하다. */
export function parseRange(header: string | null, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    // `bytes=-500`은 마지막 500바이트
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}
