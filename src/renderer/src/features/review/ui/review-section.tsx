import { ArrowDownToLine, ChevronRight, CloudCheck, CloudOff, ExternalLink, FileText, FolderOpen, FolderSearch, LayoutDashboard, RefreshCw, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DEFAULT_REVIEW_SITE_URL, REVIEW_CATEGORIES, REVIEW_CATEGORY_LABEL, type DeployStatus, type ReviewCategory } from "@shared/review";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { RepoSectionHeader, useSectionOpen } from "@/shared/ui/repo-section-header";
import { useReviewRepoStore } from "../model/use-review-repo-store";
import { ReviewDashboardDialog } from "./review-dashboard";

const DEPLOY_TEXT: Record<DeployStatus["state"], string> = {
  "up-to-date": "사이트에 반영됨",
  "deploy-needed": "사이트 빌드 중이거나 뒤처짐",
  unpushed: "푸시 안 한 커밋 있음",
  unknown: "배포 상태 모름",
};

const REFRESH_MS = 60_000;

/**
 * 핸디 리뷰 저장소: 맨 위에 Git 머리줄(브랜치·받을 커밋·배포 상태·메뉴), 그 아래 분류별 리뷰 글 트리.
 * 글을 누르면 작업 폴더의 연결된 글을 열고, 없으면 '리뷰/'로 가져와 연다. 저장소를 고르지 않았으면 보이지 않는다.
 */
export function ReviewSection() {
  const repo = useReviewRepoStore((s) => s.repo);
  const deploy = useReviewRepoStore((s) => s.deploy);
  const posts = useReviewRepoStore((s) => s.posts);
  const checking = useReviewRepoStore((s) => s.checking);
  const siteUrl = useReviewRepoStore((s) => (s.config?.deploy?.siteUrl || DEFAULT_REVIEW_SITE_URL).replace(/\/+$/, ""));
  const query = useWorkspaceStore((s) => s.query);
  const [open, toggle] = useSectionOpen("handy-review");
  const [pulling, setPulling] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState(false);

  useEffect(() => {
    const refresh = () => void useReviewRepoStore.getState().refresh();
    void useReviewRepoStore.getState().refresh({ deploy: true });
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const list = needle ? posts.filter((p) => `${p.title} ${p.path}`.toLowerCase().includes(needle)) : posts;
    return REVIEW_CATEGORIES.map((c) => ({ category: c, posts: list.filter((p) => p.category === c) })).filter((g) => g.posts.length > 0);
  }, [posts, needle]);

  if (!repo) return null;

  const pull = async () => {
    setPulling(true);
    try {
      await api.review.pull();
      toast.success("핸디 리뷰 저장소를 최신으로 받았어요.");
    } catch (e) {
      toast.error(`받지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPulling(false);
      void useReviewRepoStore.getState().refresh({ deploy: true });
    }
  };
  const choose = async () => {
    try { useReviewRepoStore.getState().setConfig(await api.review.chooseRepo()); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  const openPost = async (postPath: string) => {
    setBusyPath(postPath);
    try {
      const { path, created } = await api.review.importPost(postPath);
      const ws = useWorkspaceStore.getState();
      if (created) await ws.refresh();
      void ws.openNote(path);
      if (created) toast.success("작업 폴더의 '리뷰' 폴더로 가져왔어요. 고친 뒤 리뷰 칸에서 다시 게시하면 사이트에 반영돼요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPath(null);
    }
  };

  return (
    <section aria-label="핸디 리뷰 글">
      <RepoSectionHeader
        icon={<Star className="size-3.5" />}
        name="핸디 리뷰"
        branch={repo.branch ?? (repo.error ? "Git 오류" : "HEAD")}
        title={`${repo.error ?? repo.repo}\n우클릭: 배포 대시보드`}
        onContextMenu={() => setDashboard(true)}
        open={open}
        onToggle={toggle}
        status={(
          <>
            {repo.changes > 0 && <span className="text-amber-600" title="커밋 안 한 변경">● {repo.changes}</span>}
            {repo.ahead > 0 && <span title="올릴 커밋">↑{repo.ahead}</span>}
            {repo.behind > 0 && <span title="받을 커밋">↓{repo.behind}</span>}
            {deploy && (
              <span title={`${DEPLOY_TEXT[deploy.state]} · ${deploy.message}`} className={cn(deploy.state === "up-to-date" ? "text-emerald-600" : deploy.state === "unknown" ? "" : "text-amber-600")}>
                {deploy.state === "up-to-date" ? <CloudCheck className="size-3.5" /> : <CloudOff className="size-3.5" />}
              </span>
            )}
          </>
        )}
        actions={repo.behind > 0 && (
          <button
            type="button"
            aria-label="최신으로 받기"
            title={`최신으로 받기 (받을 커밋 ${repo.behind}개)`}
            disabled={pulling}
            onClick={() => void pull()}
            className="flex size-6 shrink-0 items-center justify-center rounded text-foreground hover:bg-accent disabled:opacity-60"
          >
            <ArrowDownToLine className={cn("size-3.5", pulling && "animate-pulse")} />
          </button>
        )}
        menu={[
          { hint: true, label: deploy ? `${DEPLOY_TEXT[deploy.state]} · ${deploy.message}` : repo.repo, onSelect: () => {} },
          { label: "배포 대시보드", icon: <LayoutDashboard className="size-3.5" />, onSelect: () => setDashboard(true) },
          ...(repo.behind > 0 ? [{ label: `최신으로 받기 (${repo.behind}개)`, icon: <ArrowDownToLine className="size-3.5" />, disabled: pulling, onSelect: () => void pull() }] : []),
          { label: "배포 상태 다시 확인", icon: <RefreshCw className={cn("size-3.5", checking && "animate-spin")} />, onSelect: () => void useReviewRepoStore.getState().refresh({ deploy: true }) },
          { label: "사이트 열기", icon: <ExternalLink className="size-3.5" />, onSelect: () => window.open(siteUrl, "_blank") },
          { label: "리뷰 폴더 열기", icon: <FolderSearch className="size-3.5" />, onSelect: () => void api.review.reveal("src/content/reviews") },
          { label: "저장소 폴더 바꾸기", icon: <FolderOpen className="size-3.5" />, onSelect: () => void choose() },
        ]}
      />
      {open && (
        <nav aria-label="핸디 리뷰 글 목록" className="flex flex-col gap-px px-2 pt-1 pb-4">
          {groups.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">{needle ? "검색 결과가 없어요" : "아직 리뷰가 없어요"}</p>
          ) : groups.map((g) => (
            <ReviewFolder key={g.category} category={g.category} forceOpen={needle !== ""}>
              {g.posts.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  title={`${p.title} · ${p.date}\n눌러서 열기 (작업 폴더에 없으면 '리뷰/'로 가져와요)`}
                  disabled={busyPath !== null}
                  onClick={() => void openPost(p.path)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-1 text-left text-sm hover:bg-accent/70 disabled:opacity-60"
                  style={{ paddingLeft: 22 }}
                >
                  <FileText className={cn("size-4 shrink-0 text-muted-foreground", busyPath === p.path && "animate-pulse")} />
                  <span className="truncate">{p.title || "(제목 없음)"}</span>
                </button>
              ))}
            </ReviewFolder>
          ))}
        </nav>
      )}
      {dashboard && <ReviewDashboardDialog onClose={() => setDashboard(false)} />}
    </section>
  );
}

function ReviewFolder({ category, forceOpen, children }: { category: ReviewCategory; forceOpen: boolean; children: React.ReactNode }) {
  const [open, toggle] = useSectionOpen(`handy-review:${category}`);
  const shown = open || forceOpen;
  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={shown} className="flex w-full items-center gap-1 rounded-md py-1.5 pr-1 text-left text-sm text-muted-foreground hover:bg-accent/70">
        <ChevronRight className={cn("size-4 shrink-0 transition-transform", shown && "rotate-90")} />
        <span className="truncate">{REVIEW_CATEGORY_LABEL[category]}</span>
      </button>
      {shown && children}
    </div>
  );
}
