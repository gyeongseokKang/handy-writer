import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createLinkResolver, parseNote, rewriteWikiLinks, type ParsedNote } from "../shared/note-parser";
import type { NoteIndexEntry } from "../shared/types";
import { listNotes, readNote, renameNote, writeNote } from "./notes-fs";

const READ_BATCH = 32;

interface Cached {
  mtime: number;
  parsed: ParsedNote;
}

/** 작업 폴더의 모든 글에서 링크와 태그를 뽑아 둔다. 바뀐 파일만 다시 읽는다. */
export class NoteIndexer {
  private cache = new Map<string, Cached>();
  private root: string | null = null;

  /** 작업 폴더가 바뀌면 캐시를 비운다. */
  setRoot(root: string | null) {
    if (root !== this.root) this.cache.clear();
    this.root = root;
  }

  invalidate(paths: string[]) {
    for (const path of paths) this.cache.delete(path);
  }

  async build(root: string): Promise<NoteIndexEntry[]> {
    this.setRoot(root);
    const notes = await listNotes(root);
    const alive = new Set(notes.map((note) => note.path));
    for (const path of this.cache.keys()) if (!alive.has(path)) this.cache.delete(path);

    const stale = notes.filter((note) => this.cache.get(note.path)?.mtime !== note.mtime);
    for (let i = 0; i < stale.length; i += READ_BATCH) {
      await Promise.all(
        stale.slice(i, i + READ_BATCH).map(async (note) => {
          try {
            const raw = await readFile(join(root, note.path), "utf8");
            this.cache.set(note.path, { mtime: note.mtime, parsed: parseNote(raw) });
          } catch {
            // 읽는 사이에 지워진 파일은 건너뛴다.
            this.cache.delete(note.path);
          }
        }),
      );
    }

    return notes.flatMap((note) => {
      const cached = this.cache.get(note.path);
      return cached ? [{ path: note.path, name: note.name, tags: cached.parsed.tags, links: cached.parsed.links }] : [];
    });
  }

  /**
   * 글 이름을 바꾸고, 그 글을 가리키던 다른 글의 `[[링크]]`도 새 이름으로 고친다.
   * 링크는 이름을 바꾸기 전의 색인으로 찾는다.
   */
  async renameWithLinks(root: string, path: string, newName: string) {
    const before = await this.build(root);
    const resolve = createLinkResolver(before);
    const meta = await renameNote(root, path, newName);

    const touched: string[] = [path, meta.path];
    let updatedNotes = 0;
    for (const entry of before) {
      if (!entry.links.some((target) => resolve(target) === path)) continue;
      const current = entry.path === path ? meta.path : entry.path;
      const raw = await readNote(root, current);
      const { content, count } = rewriteWikiLinks(
        raw,
        (target) => resolve(target) === path,
        (target) => {
          const slash = target.lastIndexOf("/");
          return slash === -1 ? meta.name : `${target.slice(0, slash + 1)}${meta.name}`;
        },
      );
      if (count === 0) continue;
      await writeNote(root, current, content);
      touched.push(current);
      updatedNotes++;
    }

    this.invalidate(touched);
    return { meta, updatedNotes };
  }
}
