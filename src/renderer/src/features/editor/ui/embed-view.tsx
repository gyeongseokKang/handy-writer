import type { EmbedAttrs } from "@shared/attachments";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { FileQuestion, FileText } from "lucide-react";

import { useEmbedSource } from "@/entities/note/model/use-embed-source";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";

export function EmbedView({ node, selected }: ReactNodeViewProps) {
  const { target, label, width, height } = node.attrs as EmbedAttrs;
  const source = useEmbedSource(target);
  // 크기를 정하지 않은 첨부는 항상 글 폭(100%)에 맞춘다.
  const style = { width: width ?? "100%", height: height ?? undefined, maxWidth: "100%" };

  let body;
  if (source.type === "note") {
    body = (
      <button
        type="button"
        className="embed-chip"
        onClick={() => void useWorkspaceStore.getState().openLink(target)}
        title="이 글 열기"
      >
        <FileText className="size-4" /> {target}
      </button>
    );
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
      style={width === null && (source.kind === "image" || source.kind === "video") ? { display: "block", width: "100%" } : undefined}
      data-embed-view={source.kind}
      contentEditable={false}
    >
      {body}
      {label && source.type !== "note" && source.type !== "missing" && <span className="embed-caption">{label}</span>}
    </NodeViewWrapper>
  );
}
