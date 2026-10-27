import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { EXPORT_FORMATS, type ExportFormat } from "@shared/export";
import { serializeNote } from "@shared/frontmatter";

import { toExportHtml } from "../lib/export-html";

interface ExportMenuProps {
  editor: Editor;
  path: string;
  name: string;
  /** 글에서 frontmatter만 따로 들고 있는 값. 마크다운으로 내보낼 때 다시 붙인다. */
  getFrontmatter: () => string;
}

/** 아래 막대의 "내보내기" 버튼. 지금 글을 마크다운, HTML, PDF 파일로 저장한다. */
export function ExportMenu({ editor, path, name, getFrontmatter }: ExportMenuProps) {
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
      const { attachments, notes } = useWorkspaceStore.getState();
      const content =
        format === "md"
          ? serializeNote(getFrontmatter(), editor.getMarkdown())
          : toExportHtml(editor.getHTML(), { attachments, noteFolder: notes.find((note) => note.path === path)?.folder ?? "" });
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
        </div>
      )}
    </div>
  );
}
