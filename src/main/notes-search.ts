import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { splitFrontmatter } from "../shared/frontmatter";
import { parseNote } from "../shared/note-parser";
import { searchNotes, type SearchDoc, type SearchResult } from "../shared/search";
import { listNotes } from "./notes-fs";

const READ_BATCH = 32;
/** 캐시가 이 글자 수를 넘으면 비우고 다시 채운다 (글 수천 개를 넘는 아주 큰 작업 폴더를 위한 안전장치) */
const MAX_CACHED_CHARS = 40_000_000;

interface Cached {
  mtime: number;
  doc: SearchDoc;
}

/** 글 내용을 메모리에 캐시해 두고 검색한다. 바뀐 파일만 다시 읽는다. */
export class NoteSearcher {
  private cache = new Map<string, Cached>();
  private root: string | null = null;
  private chars = 0;

  setRoot(root: string | null) {
    if (root !== this.root) this.clear();
    this.root = root;
  }

  invalidate(paths: string[]) {
    for (const path of paths) this.drop(path);
  }

  private clear() {
    this.cache.clear();
    this.chars = 0;
  }

  private drop(path: string) {
    const cached = this.cache.get(path);
    if (cached) this.chars -= cached.doc.body.length;
    this.cache.delete(path);
  }

  async search(root: string, query: string, limit?: number): Promise<SearchResult[]> {
    this.setRoot(root);
    const notes = await listNotes(root);
    const alive = new Set(notes.map((note) => note.path));
    for (const path of [...this.cache.keys()]) if (!alive.has(path)) this.drop(path);
    if (this.chars > MAX_CACHED_CHARS) this.clear();

    const stale = notes.filter((note) => this.cache.get(note.path)?.mtime !== note.mtime);
    for (let i = 0; i < stale.length; i += READ_BATCH) {
      await Promise.all(
        stale.slice(i, i + READ_BATCH).map(async (note) => {
          try {
            const raw = await readFile(join(root, note.path), "utf8");
            this.drop(note.path);
            const doc: SearchDoc = { path: note.path, name: note.name, body: splitFrontmatter(raw).body, tags: parseNote(raw).tags };
            this.cache.set(note.path, { mtime: note.mtime, doc });
            this.chars += doc.body.length;
          } catch {
            this.drop(note.path);
          }
        }),
      );
    }

    return searchNotes([...this.cache.values()].map((cached) => cached.doc), query, limit);
  }
}
