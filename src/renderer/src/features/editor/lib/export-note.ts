import type { Editor } from "@tiptap/core";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { isRemoteUrl, kindOfPath, resolveAttachment } from "@shared/attachments";
import type { ExportFormat } from "@shared/export";

import { collectLabels } from "./cross-ref";
import { toExportHtml, type ExportContext } from "./export-html";
import { collectFootnotes } from "./footnote";
import { htmlToDocModel } from "./html-to-doc-model";
import { resolveNoteEmbeds } from "./note-embed";

/** 문서에서 다른 글을 가리키는 끼워 넣기(`![[글]]`)의 대상을 모은다. */
function noteEmbedTargets(editor: Editor, noteFolder: string) {
  const { attachments } = useWorkspaceStore.getState();
  const targets: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "embed") return true;
    const target = String(node.attrs["target"] ?? "");
    if (target && !isRemoteUrl(target) && kindOfPath(target) === "other" && !resolveAttachment(attachments, target, noteFolder)) targets.push(target);
    return false;
  });
  return targets;
}

/** 내보낸 글에도 화면과 같은 각주·그림·표 번호와 끼워 넣은 글이 나오게 지금 문서에서 모은다. */
export async function exportContext(editor: Editor, noteFolder: string): Promise<ExportContext> {
  const { attachments, notes } = useWorkspaceStore.getState();
  return {
    attachments,
    noteFolder,
    footnotes: new Map([...collectFootnotes(editor.state.doc).values()].map((info) => [info.label, info.number])),
    labels: collectLabels(editor.state.doc),
    noteEmbeds: await resolveNoteEmbeds(noteEmbedTargets(editor, noteFolder), notes, attachments),
  };
}

/** 메인 프로세스에 넘길 내보내기 내용. md는 마크다운(getMarkdown), html·pdf는 본문 HTML, docx는 글 모양 JSON */
export async function exportContent(format: ExportFormat, editor: Editor, options: { name: string; noteFolder: string; getMarkdown: () => string }) {
  if (format === "md") return options.getMarkdown();
  const html = toExportHtml(editor.getHTML(), await exportContext(editor, options.noteFolder));
  if (format === "docx") return JSON.stringify(await htmlToDocModel(options.name, html));
  return html;
}
