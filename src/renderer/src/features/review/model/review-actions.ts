import { defaultReviewMeta, readReviewMeta, reviewBodyTemplate, writeReviewMeta } from "@shared/review-note";
import { toast } from "sonner";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";

/** 리뷰 설정이 있는 연결 탭을 열고 그 자리로 스크롤한다. */
export function showReviewSettings() {
  useUiStore.getState().setRightTab("links");
  window.requestAnimationFrame(() => document.getElementById("review-settings")?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

/** 지금 글의 속성에 `review`를 더한다 (이미 있으면 설정만 연다). */
export function makeCurrentNoteReview() {
  const bridge = useEditorBridge.getState().bridge;
  if (!bridge) return toast.error("먼저 글을 열어 주세요.");
  const current = bridge.getFrontmatter();
  if (!readReviewMeta(current)) {
    try {
      bridge.setFrontmatter(writeReviewMeta(current, defaultReviewMeta()));
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  showReviewSettings();
}

/** `리뷰/` 폴더에 리뷰 틀이 든 새 글을 만든다. */
export async function createReviewNote() {
  const frontmatter = writeReviewMeta("", defaultReviewMeta());
  await useWorkspaceStore.getState().createNote("리뷰", "새 리뷰", `${frontmatter}\n${reviewBodyTemplate("etc")}`);
  showReviewSettings();
}
