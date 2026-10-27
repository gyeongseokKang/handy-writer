import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { ATTACHMENT_DIR } from "../shared/attachments";
import type { NoteMeta } from "../shared/types";

const NOTE_EXT = ".md";
const IGNORED_DIRS = new Set(["node_modules"]);
const INVALID_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export function toPosix(path: string) {
  return path.split(sep).join("/");
}

/** 작업 폴더 밖으로 벗어나는 경로를 막고 절대 경로를 돌려준다. */
export function resolveInside(root: string, relPath: string) {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) {
    throw new Error(`작업 폴더 밖의 경로입니다: ${relPath}`);
  }
  return abs;
}

function assertNotePath(relPath: string) {
  if (!relPath.endsWith(NOTE_EXT)) throw new Error(`마크다운(.md) 파일만 다룰 수 있어요: ${relPath}`);
}

export function isHiddenPath(relPath: string) {
  return relPath.split(/[\\/]/).some((segment) => segment.startsWith("."));
}

export function sanitizeNoteName(name: string) {
  return name.replace(INVALID_NAME_CHARS, " ").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
}

async function toMeta(root: string, abs: string): Promise<NoteMeta> {
  const rel = toPosix(relative(root, abs));
  const info = await stat(abs);
  const dir = toPosix(dirname(rel));
  return {
    path: rel,
    name: basename(rel, NOTE_EXT),
    folder: dir === "." ? "" : dir,
    mtime: info.mtimeMs,
  };
}

export async function listNotes(root: string): Promise<NoteMeta[]> {
  const notes: NoteMeta[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile() && entry.name.endsWith(NOTE_EXT)) notes.push(await toMeta(root, abs));
    }
  }

  await walk(resolve(root));
  return notes.sort((a, b) => a.path.localeCompare(b.path, "ko"));
}

export async function readNote(root: string, relPath: string) {
  assertNotePath(relPath);
  return readFile(resolveInside(root, relPath), "utf8");
}

/** 임시 파일에 쓴 뒤 이름을 바꿔서, 쓰는 도중에 다른 프로그램이 반쯤 쓰인 파일을 읽지 않게 한다. */
export async function writeNote(root: string, relPath: string, content: string) {
  assertNotePath(relPath);
  const abs = resolveInside(root, relPath);
  await mkdir(dirname(abs), { recursive: true });
  const tmp = join(dirname(abs), `.${basename(abs)}.${process.pid}.tmp`);
  await writeFile(tmp, content, "utf8");
  await rename(tmp, abs);
}

async function exists(abs: string) {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

export async function createNote(root: string, folder: string, title?: string): Promise<NoteMeta> {
  const dir = resolveInside(root, folder);
  await mkdir(dir, { recursive: true });
  const base = (title && sanitizeNoteName(title)) || "제목 없음";
  let name = base;
  for (let i = 1; await exists(join(dir, name + NOTE_EXT)); i++) name = `${base} ${i}`;
  const abs = join(dir, name + NOTE_EXT);
  await writeFile(abs, "", { encoding: "utf8", flag: "wx" });
  return toMeta(resolve(root), abs);
}

export async function renameNote(root: string, relPath: string, newName: string): Promise<NoteMeta> {
  assertNotePath(relPath);
  const name = sanitizeNoteName(newName.replace(/\.md$/i, ""));
  if (!name) throw new Error("제목을 입력해 주세요.");
  const from = resolveInside(root, relPath);
  const to = join(dirname(from), name + NOTE_EXT);
  if (to === from) return toMeta(resolve(root), from);
  if (await exists(to)) throw new Error(`같은 이름의 글이 이미 있어요: ${name}`);
  await rename(from, to);
  return toMeta(resolve(root), to);
}

/** 빈 폴더도 목록에 보이도록 폴더를 따로 모은다. 숨김 폴더와 맨 위의 첨부 폴더는 뺀다. */
export async function listFolders(root: string): Promise<string[]> {
  const absRoot = resolve(root);
  const folders: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      const rel = toPosix(relative(absRoot, abs));
      if (rel === ATTACHMENT_DIR) continue;
      folders.push(rel);
      await walk(abs);
    }
  }

  await walk(absRoot);
  return folders.sort((a, b) => a.localeCompare(b, "ko"));
}

function folderName(name: string) {
  const clean = sanitizeNoteName(name);
  if (!clean) throw new Error("폴더 이름을 입력해 주세요.");
  if (clean.startsWith(".")) throw new Error("점(.)으로 시작하는 이름은 숨김 폴더가 돼요.");
  return clean;
}

/** parent 안에 새 폴더를 만들고 상대 경로를 돌려준다. 같은 이름이 있으면 뒤에 숫자를 붙인다. */
export async function createFolder(root: string, parent: string, name = "새 폴더"): Promise<string> {
  const dir = resolveInside(root, parent);
  const base = folderName(name);
  let next = base;
  for (let i = 1; await exists(join(dir, next)); i++) next = `${base} ${i}`;
  const abs = join(dir, next);
  await mkdir(abs, { recursive: true });
  return toPosix(relative(resolve(root), abs));
}

export async function renameFolder(root: string, relPath: string, newName: string): Promise<string> {
  if (!relPath) throw new Error("작업 폴더 자체는 이름을 바꿀 수 없어요.");
  const from = resolveInside(root, relPath);
  const to = join(dirname(from), folderName(newName));
  if (to === from) return relPath;
  if (await exists(to)) throw new Error(`같은 이름의 폴더가 이미 있어요: ${basename(to)}`);
  await rename(from, to);
  return toPosix(relative(resolve(root), to));
}

/** 글을 다른 폴더로 옮긴다. 이름은 그대로라 [[위키링크]]는 깨지지 않는다. */
export async function moveNote(root: string, relPath: string, folder: string): Promise<NoteMeta> {
  assertNotePath(relPath);
  const from = resolveInside(root, relPath);
  const dir = resolveInside(root, folder);
  const to = join(dir, basename(from));
  if (to === from) return toMeta(resolve(root), from);
  if (await exists(to)) throw new Error(`옮길 폴더에 같은 이름의 글이 이미 있어요: ${basename(from, NOTE_EXT)}`);
  await mkdir(dir, { recursive: true });
  await rename(from, to);
  return toMeta(resolve(root), to);
}

/** 같은 폴더에 `이름 1` 처럼 번호를 붙인 사본을 만든다. */
export async function duplicateNote(root: string, relPath: string): Promise<NoteMeta> {
  assertNotePath(relPath);
  const from = resolveInside(root, relPath);
  const base = basename(from, NOTE_EXT);
  let abs = "";
  for (let i = 1; !abs || (await exists(abs)); i++) abs = join(dirname(from), `${base} ${i}${NOTE_EXT}`);
  await writeFile(abs, await readFile(from), { flag: "wx" });
  return toMeta(resolve(root), abs);
}
