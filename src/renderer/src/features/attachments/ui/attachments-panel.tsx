import { clampSize, formatBytes, sanitizeLabel, type AttachmentKind } from "@shared/attachments";
import { ChevronRight, FileQuestion, FileText, Film, FolderOpen, ImagePlus, Locate, Music, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { attachFromDialog } from "@/entities/note/model/attach-files";
import { useEditorBridge, type EmbedItem } from "@/entities/note/model/use-editor-bridge";
import { useEmbedSource } from "@/entities/note/model/use-embed-source";
import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const KIND_LABEL: Record<AttachmentKind, string> = { image: "이미지", video: "영상", audio: "오디오", pdf: "PDF", other: "파일" };
const PRESETS = [
  { label: "작게", width: 200 },
  { label: "보통", width: 400 },
  { label: "크게", width: 600 },
] as const;
const COMMIT_DELAY_MS = 350;

const fieldClass =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** 입력하는 동안은 화면에만 반영하고, 잠깐 멈추거나 입력창을 벗어나면 글에 반영한다 (글자마다 글이 바뀌고 저장되지 않게). */
function useCommitOnPause<T>(value: T, commit: (next: T) => void) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ draft, commit });
  latest.current = { draft, commit };

  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    draft,
    change: (next: T) => {
      setDraft(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => latest.current.commit(next), COMMIT_DELAY_MS);
    },
    flush: () => {
      window.clearTimeout(timer.current);
      latest.current.commit(latest.current.draft);
    },
  };
}

function Preview({ item, onNatural }: { item: EmbedItem; onNatural: (size: { w: number; h: number }) => void }) {
  const source = useEmbedSource(item.target);
  const box = "flex h-24 items-center justify-center gap-2 rounded-md bg-muted text-sm text-muted-foreground";

  if (source.type === "missing") {
    return (
      <div className={cn(box, "border border-dashed")} role="img" aria-label="파일을 찾을 수 없어요">
        <FileQuestion className="size-4" /> 파일을 찾을 수 없어요
      </div>
    );
  }
  if (source.type === "note") {
    return (
      <div className={box}>
        <FileText className="size-4" /> 다른 글을 임베드했어요
      </div>
    );
  }
  if (source.kind === "image") {
    return (
      <img
        src={source.url}
        alt={item.label}
        className="max-h-40 w-full rounded-md bg-muted object-contain"
        onLoad={(e) => onNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
    );
  }
  if (source.kind === "video") {
    return (
      <video
        src={source.url}
        controls
        preload="metadata"
        className="max-h-40 w-full rounded-md bg-black"
        onLoadedMetadata={(e) => onNatural({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
      />
    );
  }
  if (source.kind === "audio") return <audio src={source.url} controls preload="metadata" className="w-full" />;
  return (
    <div className={box}>
      <FileText className="size-4" /> {source.meta?.name ?? item.target}
    </div>
  );
}

function Thumb({ item }: { item: EmbedItem }) {
  const source = useEmbedSource(item.target);
  const box = "flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground";
  if (source.type === "missing") return <span className={box}><FileQuestion className="size-4" /></span>;
  if (source.type === "note") return <span className={box}><FileText className="size-4" /></span>;
  if (source.kind === "image") return <img src={source.url} alt="" className="size-10 shrink-0 rounded-md bg-muted object-cover" />;
  if (source.kind === "video") return <span className={box}><Film className="size-4" /></span>;
  if (source.kind === "audio") return <span className={box}><Music className="size-4" /></span>;
  return <span className={box}><FileText className="size-4" /></span>;
}

/** 첨부 하나. 평소에는 한 줄로 접어 두고, 누르면 펼쳐서 라벨을 고친다. 크기는 그 안의 "크기 조정"에 따로 있다. */
function EmbedCard({ item }: { item: EmbedItem }) {
  const bridge = useEditorBridge((s) => s.bridge);
  const source = useEmbedSource(item.target);
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [keepRatio, setKeepRatio] = useState(item.height === null);
  const [labelError, setLabelError] = useState(false);

  const update = (patch: Parameters<NonNullable<typeof bridge>["updateEmbed"]>[1]) => bridge?.updateEmbed(item.uid, patch);
  const sizable = source.type !== "note" && source.type !== "missing" && (source.kind === "image" || source.kind === "video");

  const label = useCommitOnPause(item.label, (next) => {
    const clean = sanitizeLabel(next);
    setLabelError(clean === null);
    if (clean !== null && clean !== item.label) update({ label: clean });
  });
  const width = useCommitOnPause<string>(item.width ? String(item.width) : "", (next) => {
    const value = clampSize(next === "" ? null : Number(next));
    if (value !== item.width) update(keepRatio ? { width: value, height: null } : { width: value });
  });
  const height = useCommitOnPause<string>(item.height ? String(item.height) : "", (next) => {
    const value = clampSize(next === "" ? null : Number(next));
    if (value !== item.height) update({ height: value });
  });

  const ratioHeight = natural && item.width ? Math.round((item.width * natural.h) / natural.w) : null;

  const toggleRatio = (checked: boolean) => {
    setKeepRatio(checked);
    if (checked) update({ height: null });
    // 비율 유지를 끄면 지금 보이는 높이를 출발점으로 삼아 직접 고칠 수 있게 한다.
    else if (ratioHeight) update({ height: ratioHeight });
  };

  const fileName = source.meta?.name ?? item.target;
  const info = [
    KIND_LABEL[source.kind],
    source.meta ? formatBytes(source.meta.size) : source.type === "remote" ? "원격" : null,
    natural ? `${natural.w}×${natural.h}` : null,
  ].filter(Boolean);
  const sizeSummary = item.width ? `너비 ${item.width}${item.height ? `×${item.height}` : ""}px` : "너비 100%";

  return (
    <li data-embed-uid={item.uid} aria-label={fileName}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
      >
        <Thumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={source.meta?.path ?? item.target}>
            {fileName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{item.label || "라벨 없음"}</span>
        </span>
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <Preview item={item} onNatural={setNatural} />
          <p className="text-xs text-muted-foreground">{[...info, sizable ? sizeSummary : null].filter(Boolean).join(" · ")}</p>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">라벨 (글에 캡션으로 보여요)</span>
            <input
              value={label.draft}
              onChange={(e) => label.change(e.target.value)}
              onBlur={label.flush}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && label.flush()}
              placeholder="설명을 입력하세요"
              aria-label="라벨"
              aria-invalid={labelError}
              className={fieldClass}
            />
            {labelError && <span className="text-xs text-destructive">숫자만으로는 라벨을 만들 수 없어요 (크기와 구분이 안 돼요).</span>}
          </label>

          {sizable && (
            <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground select-none">크기 조정 ({sizeSummary})</summary>
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">너비 (px)</span>
                    <input
                      type="number"
                      min={1}
                      max={8000}
                      value={width.draft}
                      onChange={(e) => width.change(e.target.value)}
                      onBlur={width.flush}
                      placeholder="100%"
                      aria-label="너비"
                      className={fieldClass}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">높이 (px)</span>
                    <input
                      type="number"
                      min={1}
                      max={8000}
                      value={keepRatio ? (ratioHeight ?? "") : height.draft}
                      disabled={keepRatio}
                      onChange={(e) => height.change(e.target.value)}
                      onBlur={height.flush}
                      placeholder="자동"
                      aria-label="높이"
                      className={fieldClass}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={keepRatio} onChange={(e) => toggleRatio(e.target.checked)} />
                  비율 유지
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => {
                        setKeepRatio(true);
                        update({ width: preset.width, height: null });
                      }}
                    >
                      {preset.label} {preset.width}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => {
                      setKeepRatio(true);
                      update({ width: null, height: null });
                    }}
                  >
                    기본값(100%)
                  </Button>
                </div>
              </div>
            </details>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => bridge?.focusEmbed(item.uid)}>
              <Locate /> 글에서 보기
            </Button>
            {source.meta && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void api.attachments.reveal(source.meta!.path)}>
                <FolderOpen /> 폴더에서 보기
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              title="이 글에서만 지워요. 파일은 삭제되지 않아요."
              onClick={() => {
                bridge?.removeEmbed(item.uid);
                toast.info("글에서 뺐어요. 파일은 그대로 남아 있어요.");
              }}
            >
              <Trash2 /> 글에서 제거
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AttachmentsPanel() {
  const items = useEmbedStore((s) => s.items);
  const bridge = useEditorBridge((s) => s.bridge);

  return (
    <div role="region" aria-label="첨부 파일" className="flex flex-col divide-y">
      <section className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">이 글의 첨부 {items.length > 0 && <span className="font-normal text-muted-foreground">{items.length}</span>}</h2>
          <Button size="sm" variant="outline" disabled={!bridge} onClick={() => void attachFromDialog()}>
            <ImagePlus /> 첨부 추가
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">이미지나 영상을 글에 붙여넣거나 끌어다 놓아도 돼요. 파일은 작업 폴더의 attachments/ 에 저장돼요.</p>
      </section>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">이 글에는 첨부된 이미지나 영상이 없어요</p>
      ) : (
        <ul aria-label="첨부 목록" className="divide-y">
          {items.map((item) => (
            <EmbedCard key={item.uid} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
