import type { EmbedAttrs } from "@shared/attachments";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { ExternalLink, FileQuestion, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { useEmbedSource } from "@/entities/note/model/use-embed-source";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";

import { loadNoteEmbed, type NoteEmbedResult } from "../lib/note-embed";

/** 다른 글(또는 그 글의 한 절)을 읽기 전용으로 펼쳐 보여 준다. 그 글이 저장되면 다시 읽는다. */
function NoteEmbed({ target }: { target: string }) {
  const notes = useWorkspaceStore((s) => s.notes);
  const attachments = useWorkspaceStore((s) => s.attachments);
  const [result, setResult] = useState<NoteEmbedResult | null>(null);

  useEffect(() => {
    let alive = true;
    loadNoteEmbed(target, notes, attachments).then(
      (next) => alive && setResult(next),
      () => alive && setResult(null),
    );
    return () => {
      alive = false;
    };
  }, [target, notes, attachments]);

  const open = () => void useWorkspaceStore.getState().openLink(target);
  const name = result?.status === "missing" ? result.name : (result?.note.name ?? target);
  const heading = result && result.status !== "missing" ? result.heading : null;
  return (
    <span className="note-embed" role="figure" aria-label={`끼워 넣은 글: ${target}`}>
      <span className="note-embed-header">
        <FileText className="size-3.5" />
        <span className="truncate">
          {name}
          {heading && <span className="text-muted-foreground"> › {heading}</span>}
        </span>
        {result?.status !== "missing" && (
          <button type="button" className="note-embed-open" onClick={open} title="이 글 열기" aria-label={`${name} 열기`}>
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </span>
      {result?.status === "ok" && <span className="note-embed-body" dangerouslySetInnerHTML={{ __html: result.html }} />}
      {result?.status === "missing" && (
        <button type="button" className="note-embed-empty" onClick={open}>
          아직 없는 글이에요. 눌러서 만들기
        </button>
      )}
      {result?.status === "no-section" && <span className="note-embed-empty">이 글에 ‘{result.heading}’ 소제목이 없어요.</span>}
    </span>
  );
}

export function EmbedView({ node, selected }: ReactNodeViewProps) {
  const { target, label, width, height } = node.attrs as EmbedAttrs;
  const source = useEmbedSource(target);
  // 크기를 정하지 않은 첨부는 항상 글 폭(100%)에 맞춘다.
  const style = { width: width ?? "100%", height: height ?? undefined, maxWidth: "100%" };

  let body;
  if (source.type === "note") {
    body = <NoteEmbed target={target} />;
  } else if (source.type === "missing") {
    body = (
      <span className="embed-missing" role="img" aria-label={`파일을 찾을 수 없어요: ${target}`}>
        <FileQuestion className="size-4" /> 파일을 찾을 수 없어요: {target}
      </span>
    );
  } else if (source.kind === "image") {
    body = <img src={source.url} alt={label} style={style} draggable={false} className="embed-media" />;
  } else if (source.kind === "video") {
    body = <video src={source.url} controls preload="metadata" style={style} className="embed-media" />;
  } else if (source.kind === "audio") {
    body = <audio src={source.url} controls preload="metadata" className="embed-audio" />;
  } else {
    body = (
      <button
        type="button"
        className="embed-chip"
        onClick={() => source.meta && void api.attachments.reveal(source.meta.path)}
        title="폴더에서 보기"
      >
        <FileText className="size-4" /> {source.meta?.name ?? target}
      </button>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className={cn("embed", selected && "embed-selected")}
      style={source.type === "note" || (width === null && (source.kind === "image" || source.kind === "video")) ? { display: "block", width: "100%" } : undefined}
      data-embed-view={source.kind}
      contentEditable={false}
    >
      {body}
      {label && source.type !== "note" && source.type !== "missing" && <span className="embed-caption">{label}</span>}
    </NodeViewWrapper>
  );
}
