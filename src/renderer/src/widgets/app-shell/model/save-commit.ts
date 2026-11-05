import { resolveAttachment } from "@shared/attachments";
import { toast } from "sonner";

import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { flushAll } from "@/shared/lib/pending-saves";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

/**
 * Cmd/Ctrl+S: 글은 쓰는 대로 저장되므로, 남은 저장을 마저 쓰고 지금 글(과 그 글의 첨부)만 커밋한다.
 * 다른 글의 변경은 건드리지 않고, 바뀐 게 없으면 커밋하지 않으며, 푸시는 동기화·자동 푸시에 맡긴다.
 * 분할 화면이면 마지막으로 만진 쪽 글. git 저장소가 아니면 저장됐다고만 알린다.
 */
export async function saveAndCommit() {
  await flushAll();
  const ws = useWorkspaceStore.getState();
  const focused = useUiStore.getState().focusedPane;
  const path = ws.splitPaths.includes(focused) ? focused : ws.activePath;
  if (!path) return;
  const name = ws.notes.find((note) => note.path === path)?.name ?? path.replace(/\.md$/, "");

  const status = await api.git.status().catch(() => null);
  if (!status?.isRepo) return void toast.success("저장돼 있어요. 글은 쓰는 대로 저장돼요.", { id: "save-commit" });

  const paths = [path];
  // 가운데 글이면 이 글에 넣은 그림·파일도 함께 (새로 붙여 넣은 첨부가 기록에서 빠지지 않게)
  if (path === ws.activePath) {
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    for (const item of useEmbedStore.getState().items) {
      const found = resolveAttachment(ws.attachments, item.target, folder);
      if (found) paths.push(found.path);
    }
  }
  try {
    const result = await api.git.commitPaths(paths, `글: ${name}`);
    if (result.outcome === "committed") toast.success(`커밋했어요${result.hash ? ` (${result.hash})` : ""} · ${name}`, { id: "save-commit" });
    else toast.info("바뀐 게 없어서 커밋하지 않았어요. 저장은 돼 있어요.", { id: "save-commit" });
  } catch (error) {
    toast.error(`커밋하지 못했어요: ${errorText(error)}`, { id: "save-commit" });
  }
}
