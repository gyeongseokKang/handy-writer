import { Editor } from "@tiptap/core";

import type { NoteMeta } from "@shared/types";
import type { AttachmentMeta } from "@shared/attachments";
import { splitFrontmatter } from "@shared/frontmatter";
import { extractSection, splitEmbedTarget } from "@shared/note-section";
import { api } from "@/shared/api/handy-api";

import { createExtensions } from "./create-extensions";
import { toExportHtml } from "./export-html";

/** 화면에 붙이지 않는 에디터. 다 쓰면 destroy()로 치운다. */
export function createHeadlessEditor(markdown: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
}

/** 마크다운을 에디터와 같은 규칙으로 읽어 HTML로 만든다. */
export function markdownToHtml(markdown: string) {
  const editor = createHeadlessEditor(markdown);
  try {
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

export type NoteEmbedResult =
  | { status: "ok"; note: NoteMeta; heading: string | null; html: string }
  | { status: "missing"; name: string }
  | { status: "no-section"; note: NoteMeta; heading: string };

export function findNote(notes: NoteMeta[], name: string) {
  const lower = name.toLowerCase();
  return notes.find((note) => note.name.toLowerCase() === lower) ?? null;
}

const cache = new Map<string, Promise<NoteEmbedResult>>();

/**
 * `![[글]]`, `![[글#소제목]]`이 가리키는 글(또는 그 절)을 읽어 보여 줄 HTML로 만든다.
 * 끼워 넣은 글 안의 그림은 그 글의 폴더를 기준으로 찾고, 그 안의 또 다른 끼워 넣기는 이름만 남긴다.
 */
export function loadNoteEmbed(target: string, notes: NoteMeta[], attachments: AttachmentMeta[]): Promise<NoteEmbedResult> {
  const { name, heading } = splitEmbedTarget(target);
  const note = findNote(notes, name);
  if (!note) return Promise.resolve({ status: "missing", name });
  const key = `${note.path}\u0000${note.mtime}\u0000${heading ?? ""}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = api.notes.read(note.path).then((raw): NoteEmbedResult => {
      const body = splitFrontmatter(raw).body;
      const part = heading ? extractSection(body, heading) : body;
      if (part === null) return { status: "no-section", note, heading: heading ?? "" };
      return { status: "ok", note, heading, html: toExportHtml(markdownToHtml(part), { attachments, noteFolder: note.folder }) };
    });
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  return hit;
}

/** 문서 안의 다른 글 끼워 넣기를 모두 읽어 둔다 (내보낼 때 실제 내용으로 바꾸려고). */
export async function resolveNoteEmbeds(targets: Iterable<string>, notes: NoteMeta[], attachments: AttachmentMeta[]) {
  const out = new Map<string, string>();
  await Promise.all(
    [...new Set(targets)].map(async (target) => {
      const result = await loadNoteEmbed(target, notes, attachments).catch(() => null);
      if (result?.status === "ok") out.set(target, result.html);
    }),
  );
  return out;
}
