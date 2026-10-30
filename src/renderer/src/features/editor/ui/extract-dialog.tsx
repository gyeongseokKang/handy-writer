import { Download, FilePlus2, Link2, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { Button } from "@/shared/ui/button";
import { extractFrontmatter, normalizeExtractUrl, type ExtractResult } from "@shared/extract";
import { textStats } from "@shared/text-stats";

import { htmlToMarkdown } from "../lib/html-to-markdown";

const fieldClass = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** 링크에서 글 가져오기: 주소를 넣으면 본문을 뽑아 미리 보여주고, 새 글로 만들거나 지금 글에 넣는다. */
export function ExtractDialog({ mode }: { mode: "new" | "insert" }) {
  const close = () => useUiStore.getState().setExtract(null);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [title, setTitle] = useState("");

  // 본문 첫 줄이 제목과 같은 제목 줄이면 뺀다 (제목은 글 이름이 된다).
  const markdown = useMemo(() => {
    if (!result) return "";
    const md = htmlToMarkdown(result.html, result.url);
    const first = /^#{1,6}\s+(.+)\n*/.exec(md);
    return first && result.title.includes(first[1]!.trim()) ? md.slice(first[0].length) : md;
  }, [result]);
  const sourceLine = result ? `출처: [${(title || result.title || result.url).replace(/[\[\]]/g, "")}](${result.url})` : "";

  const run = async () => {
    const normalized = normalizeExtractUrl(url);
    if (!normalized) return setError("http:// 또는 https://로 시작하는 주소를 넣어 주세요.");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const extracted = await api.extract.fromUrl(normalized);
      setResult(extracted);
      setTitle(extracted.title || new URL(extracted.url).hostname);
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    } finally {
      setBusy(false);
    }
  };

  const toNewNote = async () => {
    if (!result) return;
    close();
    await useWorkspaceStore.getState().createNote("", title.trim() || result.title, `${extractFrontmatter(result)}\n${markdown}\n\n${sourceLine}\n`);
    toast.success("링크에서 가져온 글을 새 글로 만들었어요.");
  };

  const toCurrentNote = () => {
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge || !result) return;
    bridge.insertBelowCursor(`${markdown}\n\n${sourceLine}`);
    close();
  };

  const stats = textStats(markdown);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[6vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="링크에서 글 가져오기"
        className="w-full max-w-2xl space-y-4 rounded-xl border bg-card px-7 py-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && !event.nativeEvent.isComposing && close()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Download className="size-4" /> 링크에서 글 가져오기
          </h2>
          <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <input autoFocus aria-label="가져올 주소" value={url} placeholder="https://… 블로그·기사·유튜브 주소" onChange={(e) => setUrl(e.target.value)} className={`${fieldClass} pl-8`} />
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={busy || !url.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} 가져오기
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">페이지에서 광고·메뉴를 빼고 본문만 가져와요. 유튜브는 영상 설명과 자막을 가져와요. 원래 주소는 글의 frontmatter(source)와 맨 아래에 남아요.</p>

        {busy && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 페이지를 읽는 중… (최대 30초)
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {error}
          </p>
        )}

        {result && (
          <section aria-label="가져온 글" className="space-y-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">제목</span>
              <input aria-label="가져온 글 제목" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
            </label>
            <p className="truncate text-xs text-muted-foreground">
              {[result.siteName, result.byline, `${stats.chars.toLocaleString("ko-KR")}자`].filter(Boolean).join(" · ")}
            </p>
            <div className="max-h-[40vh] overflow-y-auto rounded-md border bg-background p-3">
              <p aria-label="가져온 본문 미리보기" className="text-sm leading-7 break-words whitespace-pre-wrap">
                {markdown}
              </p>
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          {result && activePath && (
            <Button size="sm" variant={mode === "insert" ? "default" : "outline"} onClick={toCurrentNote}>
              지금 글에 넣기
            </Button>
          )}
          {result && (
            <Button size="sm" variant={mode === "insert" && activePath ? "outline" : "default"} onClick={() => void toNewNote()}>
              <FilePlus2 /> 새 글로 만들기
            </Button>
          )}
          {!result && (
            <Button size="sm" variant="ghost" onClick={close}>
              닫기
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
