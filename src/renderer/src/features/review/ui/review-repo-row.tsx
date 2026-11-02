import { CloudCheck, CloudOff, ExternalLink, FolderOpen, FolderSearch, RefreshCw, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DEFAULT_REVIEW_SITE_URL, type DeployStatus } from "@shared/review";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { useReviewRepoStore } from "../model/use-review-repo-store";

const DEPLOY_TEXT: Record<DeployStatus["state"], string> = {
  "up-to-date": "사이트에 반영됨",
  "deploy-needed": "사이트 빌드 중",
  unpushed: "푸시 안 한 커밋 있음",
  unknown: "배포 상태 모름",
};

const REFRESH_MS = 60_000;

/**
 * 사이드바 아래 저장소 목록의 핸디 리뷰 줄. 글쓰기 작업 폴더와 다른 Git이라 구분선으로 나눠 보여 준다.
 * 누르면 사이트 열기·폴더 열기·저장소 바꾸기 메뉴가 뜬다. 저장소를 고르지 않았으면 보이지 않는다.
 */
export function ReviewRepoRow() {
  const repo = useReviewRepoStore((s) => s.repo);
  const deploy = useReviewRepoStore((s) => s.deploy);
  const checking = useReviewRepoStore((s) => s.checking);
  const siteUrl = useReviewRepoStore((s) => (s.config?.deploy?.siteUrl || DEFAULT_REVIEW_SITE_URL).replace(/\/+$/, ""));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => void useReviewRepoStore.getState().refresh();
    void useReviewRepoStore.getState().refresh({ deploy: true });
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!repo) return null;
  const choose = async () => {
    setOpen(false);
    try { useReviewRepoStore.getState().setConfig(await api.review.chooseRepo()); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent";

  return (
    <div ref={ref} className="relative border-t text-xs text-muted-foreground">
      <button
        type="button"
        aria-label="핸디 리뷰 저장소 상태"
        aria-expanded={open}
        title={repo.error ?? `${repo.repo}\n${deploy ? DEPLOY_TEXT[deploy.state] : ""}`}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex w-full min-w-0 items-center gap-2 px-4 py-2 text-left hover:bg-accent/70", open && "bg-accent text-foreground")}
      >
        <Star className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium text-foreground/80">핸디 리뷰</span>
        <span className="truncate">{repo.branch ?? (repo.error ? "Git 오류" : "HEAD")}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {repo.changes > 0 && <span className="text-amber-600" title="커밋 안 한 변경">● {repo.changes}</span>}
          {repo.ahead > 0 && <span title="올릴 커밋">↑{repo.ahead}</span>}
          {repo.behind > 0 && <span title="받을 커밋">↓{repo.behind}</span>}
          {deploy && (
            <span title={DEPLOY_TEXT[deploy.state]} className={cn(deploy.state === "up-to-date" ? "text-emerald-600" : deploy.state === "unknown" ? "" : "text-amber-600")}>
              {deploy.state === "up-to-date" ? <CloudCheck className="size-3.5" /> : <CloudOff className="size-3.5" />}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-2 bottom-full left-2 z-30 mb-1 rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
          <p className="px-2 py-1 text-[11px] text-muted-foreground">{deploy ? `${DEPLOY_TEXT[deploy.state]} · ${deploy.message}` : "배포 상태를 확인하지 않았어요"}</p>
          <a role="menuitem" href={siteUrl} target="_blank" rel="noreferrer" className={item} onClick={() => setOpen(false)}><ExternalLink className="size-3.5" /> 사이트 열기</a>
          <button role="menuitem" type="button" className={item} onClick={() => void useReviewRepoStore.getState().refresh({ deploy: true })}>
            <RefreshCw className={cn("size-3.5", checking && "animate-spin")} /> 배포 상태 다시 확인
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); void api.review.reveal("src/content/reviews"); }}><FolderSearch className="size-3.5" /> 리뷰 폴더 열기</button>
          <button role="menuitem" type="button" className={item} onClick={() => void choose()}><FolderOpen className="size-3.5" /> 저장소 폴더 바꾸기</button>
        </div>
      )}
    </div>
  );
}
