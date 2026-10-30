import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { EXPORT_FORMATS, type ExportFormat } from "@shared/export";
import { serializeNote } from "@shared/frontmatter";

import { collectLabels } from "../lib/cross-ref";
import { toExportHtml, withPasteStyles, type ExportContext } from "../lib/export-html";
import { collectFootnotes } from "../lib/footnote";

interface ExportMenuProps {
  editor: Editor;
  path: string;
  name: string;
  /** 글에서 frontmatter만 따로 들고 있는 값. 마크다운으로 내보낼 때 다시 붙인다. */
  getFrontmatter: () => string;
  /** 원문을 보존한 본문 마크다운 (없으면 에디터의 출력) */
  getMarkdown?: () => string;
  /** 분할 화면에서 이 에디터가 단축키를 받을 차례인지 */
  isShortcutTarget?: () => boolean;
}

/** 아래 막대의 "내보내기" 버튼. 지금 글을 마크다운, HTML, PDF 파일로 저장한다. */
/** 내보낸 글에도 화면과 같은 각주·그림·표 번호가 나오게 지금 문서에서 번호를 모은다. */
function exportContext(editor: Editor, path: string): ExportContext {
  const { attachments, notes } = useWorkspaceStore.getState();
  return {
    attachments,
    noteFolder: notes.find((note) => note.path === path)?.folder ?? "",
    footnotes: new Map([...collectFootnotes(editor.state.doc).values()].map((info) => [info.label, info.number])),
    labels: collectLabels(editor.state.doc),
  };
}

export function ExportMenu({ editor, path, name, getFrontmatter, getMarkdown = () => editor.getMarkdown(), isShortcutTarget = () => true }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      const content = format === "md" ? serializeNote(getFrontmatter(), getMarkdown()) : toExportHtml(editor.getHTML(), exportContext(editor, path));
      const { path: saved } = await api.export.note({ name, format, content });
      if (saved) {
        toast.success("내보냈어요.", { description: saved, action: { label: "위치 보기", onClick: () => void api.export.reveal(saved) } });
      }
    } catch (error) {
      toast.error(`내보내지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  // 블로그·메일에 붙여 넣으면 제목·굵게·표·이미지가 그대로 살아 있게 서식 있는 HTML로 복사한다.
  const copyRich = async () => {
    setOpen(false);
    try {
      const html = toExportHtml(editor.getHTML(), exportContext(editor, path));
      await api.export.copy(withPasteStyles(html), editor.getText({ blockSeparator: "\n\n" }));
      toast.success("서식 있는 글로 복사했어요. 블로그나 메일에 붙여 넣으세요.");
    } catch (error) {
      toast.error(`복사하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const copyRef = useRef(copyRich);
  copyRef.current = copyRich;
  const shortcutRef = useRef(isShortcutTarget);
  shortcutRef.current = isShortcutTarget;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== "c") return;
      if (!shortcutRef.current()) return;
      event.preventDefault();
      void copyRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // 명령 팔레트의 복사·내보내기 요청 (단축키를 받을 에디터만 처리한다)
  const editorRequest = useUiStore((state) => state.editorRequest);
  const handledRequest = useRef(useUiStore.getState().editorRequest?.seq ?? 0);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!editorRequest || editorRequest.seq === handledRequest.current || editorRequest.kind === "find" || !shortcutRef.current()) return;
    handledRequest.current = editorRequest.seq;
    if (editorRequest.kind === "copy-rich") void copyRef.current();
    else void runRef.current(editorRequest.kind.replace("export-", "") as ExportFormat);
  }, [editorRequest]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="내보내기"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={cn("rounded px-1.5 py-0.5 hover:bg-accent disabled:opacity-50", open && "bg-accent")}
      >
        {busy ? "내보내는 중…" : "내보내기"}
      </button>
      {open && (
        <div role="menu" aria-label="내보내기" className="absolute right-0 bottom-full z-40 mb-2 w-48 rounded-lg border bg-card p-1 text-sm text-foreground shadow-lg">
          {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              onClick={() => void run(format)}
              className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent"
            >
              {EXPORT_FORMATS[format].label}
            </button>
          ))}
          <div role="separator" className="-mx-1 my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            title="블로그·메일 편집기에 붙여 넣을 수 있게 복사해요 (Ctrl/Cmd+Shift+C)"
            onClick={() => void copyRich()}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent"
          >
            서식 있는 글로 복사
          </button>
        </div>
      )}
    </div>
  );
}
