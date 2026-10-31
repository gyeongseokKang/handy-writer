import type { NoteMeta } from "@shared/types";
import type { ExportFormat } from "@shared/export";
import { splitFrontmatter } from "@shared/frontmatter";
import { combineChapters } from "@shared/manuscript";
import { api } from "@/shared/api/handy-api";
import { exportContent } from "@/features/editor/lib/export-note";
import { createHeadlessEditor } from "@/features/editor/lib/note-embed";

/** 원고의 장들을 하나로 이은 마크다운 (frontmatter는 뺀다) */
export async function manuscriptMarkdown(chapters: NoteMeta[]) {
  const bodies = await Promise.all(chapters.map(async (note) => ({ name: note.name, body: splitFrontmatter(await api.notes.read(note.path)).body })));
  return combineChapters(bodies);
}

/** 원고를 한 파일로 내보낸다. 저장 창에서 취소하면 null */
export async function exportManuscript(name: string, folder: string, chapters: NoteMeta[], format: ExportFormat) {
  const markdown = await manuscriptMarkdown(chapters);
  let content = markdown;
  if (format !== "md") {
    const editor = createHeadlessEditor(markdown);
    try {
      content = await exportContent(format, editor, { name, noteFolder: folder, getMarkdown: () => markdown });
    } finally {
      editor.destroy();
    }
  }
  return (await api.export.note({ name, format, content })).path;
}
