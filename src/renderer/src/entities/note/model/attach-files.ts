import { extensionOf, kindOfPath, resolveAttachment, type AttachmentMeta } from "@shared/attachments";
import { toast } from "sonner";

import { api } from "@/shared/api/handy-api";

import { useEditorBridge } from "./use-editor-bridge";
import { useWorkspaceStore } from "./use-workspace-store";

/** 같은 이름의 파일이 여럿이면 경로로, 아니면 이름만 써서 Obsidian처럼 짧게 만든다. */
function targetFor(meta: AttachmentMeta) {
  const { attachments } = useWorkspaceStore.getState();
  return resolveAttachment(attachments, meta.name)?.path === meta.path ? meta.name : meta.path;
}

async function insert(metas: AttachmentMeta[], pos?: number) {
  if (metas.length === 0) return;
  // 글이 파일을 찾을 수 있도록 목록을 먼저 새로 읽는다.
  await useWorkspaceStore.getState().refresh();
  useEditorBridge.getState().bridge?.insertEmbeds(metas.map(targetFor), pos);
}

/** 파일 선택 창에서 고른 파일을 attachments/ 로 복사해 현재 글에 넣는다. */
export async function attachFromDialog() {
  try {
    const { imported, skipped } = await api.attachments.pick();
    if (skipped.length > 0) toast.warning(`지원하지 않는 형식이라 건너뛰었어요: ${skipped.join(", ")}`);
    await insert(imported);
  } catch (error) {
    toast.error(`첨부하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const MIME_EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm" };
const GENERIC_NAME = /^(image|blob|untitled)\.\w+$/i;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 클립보드의 이미지는 `image.png` 같은 이름이라, Obsidian처럼 `Pasted image 20261023141500.png`로 바꾼다. */
export function nameForFile(file: { name: string; type: string }, now = new Date()) {
  const ext = extensionOf(file.name) || MIME_EXTENSION[file.type] || "";
  if (file.name && !GENERIC_NAME.test(file.name) && kindOfPath(file.name) !== "other") return file.name;
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Pasted ${file.type.startsWith("video/") ? "video" : "image"} ${stamp}${ext ? `.${ext}` : ""}`;
}

export const isAttachableFile = (file: { name: string; type: string }) =>
  kindOfPath(file.name) !== "other" || /^(image|video|audio)\//.test(file.type) || file.type === "application/pdf";

/** 붙여넣거나 끌어다 놓은 파일들을 저장하고 글에 넣는다. */
export async function saveFilesAndInsert(files: File[], pos?: number) {
  const saved: AttachmentMeta[] = [];
  for (const file of files) {
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      saved.push(await api.attachments.save(nameForFile(file), data));
    } catch (error) {
      toast.error(`${file.name || "파일"}: ${error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error)}`);
    }
  }
  await insert(saved, pos);
}
