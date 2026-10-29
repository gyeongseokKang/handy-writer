import { assetUrl, isRemoteUrl, kindOfPath, resolveAttachment } from "@shared/attachments";
import { useMemo } from "react";

import { useNotePath } from "./note-path-context";
import { useWorkspaceStore } from "./use-workspace-store";

/** 임베드 대상이 실제로 무엇인지(첨부 파일, 원격 주소, 다른 글, 없는 파일) 알아낸다. */
export function useEmbedSource(target: string) {
  const attachments = useWorkspaceStore((s) => s.attachments);
  const notePath = useNotePath();
  const folder = useWorkspaceStore((s) => s.notes.find((n) => n.path === (notePath ?? s.activePath))?.folder ?? "");

  return useMemo(() => {
    if (isRemoteUrl(target)) return { type: "remote" as const, kind: kindOfPath(target), url: target, meta: null };
    const meta = resolveAttachment(attachments, target, folder);
    if (meta) return { type: "file" as const, kind: meta.kind, url: assetUrl(meta.path), meta };
    // 확장자가 첨부 형식이면 아직 없는 파일, 아니면 다른 글을 가리키는 임베드로 본다.
    return { type: kindOfPath(target) === "other" ? ("note" as const) : ("missing" as const), kind: kindOfPath(target), url: "", meta: null };
  }, [attachments, target, folder]);
}
