import { CircleCheck, CircleDashed, CircleX, ExternalLink, FileText, LoaderCircle, RefreshCw, Send, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DASHBOARD_POST_LABEL, DEFAULT_REVIEW_SITE_URL, REVIEW_CATEGORY_LABEL,
  type DashboardPostState, type ReviewDashboard, type ReviewDashboardCommit, type ReviewDashboardPost,
} from "@shared/review";
import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { useReviewRepoStore } from "../model/use-review-repo-store";

/** 푸시하고 이만큼 지나도 사이트가 그 커밋이 아니면 빌드가 실패했을 수 있다고 알린다. */
const STALE_MINUTES = 15;

const STATE_STYLE: Record<DashboardPostState, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  published: "bg-muted text-muted-foreground",
  pending: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  unpushed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  changed: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  blocked: "bg-red-500/10 text-red-700 dark:text-red-400",
  draft: "bg-muted text-muted-foreground",
};

type Filter = "todo" | "pending" | "live" | "all";
const FILTERS: { key: Filter; label: string; states: DashboardPostState[] | null }[] = [
  { key: "todo", label: "할 일", states: ["changed", "blocked", "unpushed", "draft"] },
  { key: "pending", label: "반영 대기", states: ["pending"] },
  { key: "live", label: "반영됨", states: ["live", "published"] },
  { key: "all", label: "전체", states: null },
];
/** 할 일 중 먼저 볼 것부터 */
const ORDER: DashboardPostState[] = ["blocked", "changed", "unpushed", "pending", "draft", "published", "live"];

function relativeTime(iso: string | null | undefined) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}
const minutesSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60_000;
const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 7) : "—");
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 사이트 반영 상황을 한 문장으로. 빌드 결과를 읽을 수 있으면 그걸 먼저 믿는다. */
function siteVerdict(d: ReviewDashboard): { tone: "ok" | "wait" | "bad" | "muted"; text: string; url?: string | null } {
  const { status } = d;
  if (status.state === "unpushed") return { tone: "wait", text: "이 컴퓨터에만 있는 커밋이 있어요. 게시(푸시)해야 사이트가 다시 빌드돼요." };
  if (status.state === "unknown") return { tone: "muted", text: status.message };
  if (status.state === "up-to-date") return { tone: "ok", text: "사이트가 원격 main의 최신 커밋으로 배포돼 있어요." };
  const waiting = d.commits.filter((c) => c.deployed === false);
  const failed = waiting.find((c) => c.build === "failure");
  if (failed) return { tone: "bad", text: `빌드가 실패했어요 (${short(failed.sha)} ${failed.subject}). 로그를 확인해 주세요.`, url: failed.buildUrl };
  const newest = waiting[0];
  if (newest?.build === "pending") return { tone: "wait", text: "사이트가 빌드 중이에요. 끝나면 저절로 반영돼요." };
  const oldest = waiting[waiting.length - 1];
  if (oldest && minutesSince(oldest.date) > STALE_MINUTES && newest?.build !== "success") {
    return { tone: "bad", text: `푸시한 지 ${STALE_MINUTES}분이 넘었는데 아직 반영되지 않았어요. Cloudflare 빌드가 실패했을 수 있어요.` };
  }
  return { tone: "wait", text: `원격 main이 배포본보다 ${status.behindBy ?? waiting.length}커밋 앞서요. 빌드가 끝나면 반영돼요.` };
}

function BuildIcon({ commit }: { commit: ReviewDashboardCommit }) {
  const icon = commit.build === "success" ? <CircleCheck className="size-3.5 text-emerald-600" />
    : commit.build === "failure" ? <CircleX className="size-3.5 text-red-600" />
    : commit.build === "pending" ? <LoaderCircle className="size-3.5 animate-spin text-sky-600" />
    : <CircleDashed className="size-3.5 text-muted-foreground/60" />;
  const label = commit.build === "success" ? "빌드 성공" : commit.build === "failure" ? "빌드 실패" : commit.build === "pending" ? "빌드 중" : "빌드 결과 모름";
  return commit.buildUrl ? (
    <a href={commit.buildUrl} target="_blank" rel="noreferrer" title={`${label} · 로그 열기`} aria-label={label} className="shrink-0">{icon}</a>
  ) : <span title={label} aria-label={label} className="shrink-0">{icon}</span>;
}

/**
 * 핸디 리뷰 배포 대시보드: 사이트가 어느 커밋으로 배포됐는지, 최근 커밋의 빌드 결과,
 * 작업 폴더의 리뷰 글마다 사이트에 반영됐는지(수정 후 미게시·반영 대기 등)를 한 화면에 보여 준다.
 * 배포는 푸시하면 Cloudflare가 저절로 하므로 여기서 다시 배포하지는 않는다.
 */
export function ReviewDashboardDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<ReviewDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const siteUrl = (data?.siteUrl || DEFAULT_REVIEW_SITE_URL).replace(/\/+$/, "");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await api.review.dashboard()); } catch (e) { setError(errText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map((f) => [f.key, 0])) as Record<Filter, number>;
    for (const p of data?.posts ?? []) for (const f of FILTERS) if (!f.states || f.states.includes(p.state)) c[f.key]++;
    return c;
  }, [data]);
  const shown = useMemo(() => {
    const states = FILTERS.find((f) => f.key === filter)?.states;
    return (data?.posts ?? []).filter((p) => !states || states.includes(p.state))
      .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (b.commitDate ?? "").localeCompare(a.commitDate ?? "") || a.title.localeCompare(b.title, "ko"));
  }, [data, filter]);
  const changed = (data?.posts ?? []).filter((p) => p.state === "changed" && p.notePath);

  const openPost = async (p: ReviewDashboardPost) => {
    const ws = useWorkspaceStore.getState();
    try {
      if (p.notePath) {
        void ws.openNote(p.notePath);
        return onClose();
      }
      if (!p.postPath) return;
      const { path, created } = await api.review.importPost(p.postPath);
      if (created) await ws.refresh();
      void ws.openNote(path);
      onClose();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const publish = async (posts: ReviewDashboardPost[]) => {
    const targets = posts.filter((p) => p.notePath);
    if (targets.length === 0) return;
    setBusy(targets.length === 1 ? targets[0]!.notePath : "all");
    let done = 0;
    try {
      // 열어 둔 글의 고친 내용부터 저장한다.
      await useEditorBridge.getState().bridge?.flush();
      for (const p of targets) {
        try {
          const r = await api.review.publishNoteAndRecord(p.notePath!);
          done++;
          for (const w of r.warnings) toast.warning(`${p.title}: ${w}`);
        } catch (e) {
          toast.error(`${p.title} 게시 실패: ${errText(e)}`);
        }
      }
      if (done > 0) toast.success(`${done}개 글을 게시했어요. 사이트가 다시 빌드되면 반영돼요.`);
    } finally {
      setBusy(null);
      void useReviewRepoStore.getState().refresh({ deploy: true });
      void load();
    }
  };

  const verdict = data ? siteVerdict(data) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="핸디 리뷰 배포 대시보드"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b px-4 py-2.5">
          <h2 className="font-semibold">배포 대시보드</h2>
          <span className="text-xs text-muted-foreground">핸디 리뷰</span>
          <button type="button" aria-label="다시 확인" title="다시 확인" disabled={loading} onClick={() => void load()} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-60">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
          <button type="button" autoFocus aria-label="닫기" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">확인하지 못했어요: {error}</p>}
          {!data && loading && <p className="py-10 text-center text-sm text-muted-foreground">원격 저장소와 사이트를 확인하는 중…</p>}

          {data && verdict && (
            <section aria-label="사이트" className="space-y-2 rounded-lg border p-3">
              <div className={cn("flex items-start gap-2 text-sm", verdict.tone === "ok" && "text-emerald-700 dark:text-emerald-400", verdict.tone === "bad" && "text-red-700 dark:text-red-400", verdict.tone === "wait" && "text-amber-700 dark:text-amber-400", verdict.tone === "muted" && "text-muted-foreground")}>
                {verdict.tone === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : verdict.tone === "bad" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <CircleDashed className="mt-0.5 size-4 shrink-0" />}
                <p className="flex-1">{verdict.text}{verdict.url && <> <a href={verdict.url} target="_blank" rel="noreferrer" className="underline">빌드 로그</a></>}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">사이트 배포본</dt>
                <dd className="font-mono">{short(data.status.deployedSha)}{data.status.deployedAt && <span className="ml-2 font-sans text-muted-foreground">{relativeTime(data.status.deployedAt)} 빌드</span>}</dd>
                <dt className="text-muted-foreground">원격 main</dt>
                <dd className="font-mono">{short(data.status.remoteSha)}{!!data.status.behindBy && <span className="ml-2 font-sans text-amber-700 dark:text-amber-400">배포본보다 {data.status.behindBy}커밋 앞섬</span>}</dd>
                <dt className="text-muted-foreground">사이트</dt>
                <dd><a href={siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{siteUrl.replace(/^https?:\/\//, "")} <ExternalLink className="size-3" /></a></dd>
              </dl>
              {data.buildCheck === "unavailable" && (
                <p className="text-[11px] text-muted-foreground">저장소가 비공개라 빌드 결과는 이 컴퓨터의 GitHub CLI(gh) 로그인으로 읽어요. <code>gh auth login</code>을 하면 커밋마다 빌드 성공·실패도 보여요.</p>
              )}
            </section>
          )}

          {data && (
            <section aria-label="리뷰 글" className="space-y-2">
              <div className="flex flex-wrap items-center gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                  >
                    {f.label} <span className="tabular-nums opacity-80">{counts[f.key]}</span>
                  </button>
                ))}
                {changed.length > 0 && (
                  <Button size="sm" className="ml-auto h-7" disabled={busy !== null} onClick={() => void publish(changed)}>
                    <Send /> {busy === "all" ? "게시 중…" : `수정된 글 모두 게시 (${changed.length})`}
                  </Button>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{filter === "todo" ? "할 일이 없어요. 모든 글이 게시돼 있어요." : "해당하는 글이 없어요."}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {shown.map((p) => (
                    <li key={p.notePath ?? p.postPath} className="flex items-center gap-2 px-3 py-2">
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", STATE_STYLE[p.state])}>{DASHBOARD_POST_LABEL[p.state]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{p.title || "(제목 없음)"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {p.category ? REVIEW_CATEGORY_LABEL[p.category] : ""}
                          {p.commitDate && ` · ${relativeTime(p.commitDate)} 커밋`}
                          {!p.notePath && " · 작업 폴더에 없음"}
                          {p.problems[0] && <span className="text-red-700 dark:text-red-400"> · {p.problems[0]}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {p.slug && (p.state === "live" || p.state === "pending" || p.state === "published" || p.state === "changed") && (
                          <a href={`${siteUrl}/review/${encodeURIComponent(p.slug)}/`} target="_blank" rel="noreferrer" title="사이트에서 보기" aria-label={`${p.title} 사이트에서 보기`} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                        <button type="button" title={p.notePath ? "글 열기" : "작업 폴더로 가져와 열기"} aria-label={`${p.title} 열기`} onClick={() => void openPost(p)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                          <FileText className="size-3.5" />
                        </button>
                        {p.notePath && (p.state === "changed" || p.state === "draft" || p.state === "unpushed") && (
                          <Button size="sm" variant="outline" className="h-7" disabled={busy !== null} onClick={() => void publish([p])}>
                            <Send /> {busy === p.notePath ? "게시 중…" : p.state === "draft" ? "게시" : p.state === "unpushed" ? "푸시" : "다시 게시"}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {data && data.commits.length > 0 && (
            <section aria-label="최근 커밋" className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">원격 main 최근 커밋</h3>
              <ul className="divide-y rounded-lg border">
                {data.commits.map((c) => (
                  <li key={c.sha} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <BuildIcon commit={c} />
                    <code className="shrink-0 text-muted-foreground">{short(c.sha)}</code>
                    <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                    <span className="shrink-0 text-muted-foreground">{relativeTime(c.date)}</span>
                    {c.deployed !== null && (
                      <span className={cn("w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px]", c.deployed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-sky-500/10 text-sky-700 dark:text-sky-400")}>
                        {c.deployed ? "배포됨" : "반영 대기"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
