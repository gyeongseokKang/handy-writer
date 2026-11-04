import { BadgeCheck, CloudCheck, CloudOff, TriangleAlert, Eye, ExternalLink, FolderOpen, Plus, RefreshCw, Send, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_REVIEW_SITE_URL, REVIEW_CATEGORIES, REVIEW_CATEGORY_LABEL,
  type DeployStatus, type ReviewCategory, type ReviewLink, type ReviewPostSummary,
} from "@shared/review";
import {
  coupangLinkKind, readReviewMeta, reviewProblems, reviewSlugOf, reviewWarnings, slugOfReviewPath, writeReviewMeta,
  sortSeries, type ReviewMeta, type ReviewNotePreview, type ReviewSeriesEntry,
} from "@shared/review-note";
import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { useReviewRepoStore } from "../model/use-review-repo-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const input = "w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/40";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const COMMIT_DELAY_MS = 400;

/** 입력 칸 하나에 붙는 이름. 버튼이 여럿 든 묶음(별점, 링크)은 group으로 둬서 label이 클릭을 가로채지 않게 한다. */
function Field({ label, hint, group = false, children }: { label: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const caption = <span className="block text-xs font-medium text-muted-foreground">{label}{hint && <span className="ml-1 font-normal opacity-70">{hint}</span>}</span>;
  return group ? (
    <div role="group" aria-label={label} className="space-y-1">{caption}{children}</div>
  ) : (
    <label className="block space-y-1">{caption}{children}</label>
  );
}

function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n}점`}
          title="왼쪽 반을 누르면 0.5점"
          className="relative size-6"
          onClick={(e) => {
            const half = e.nativeEvent.offsetX < (e.currentTarget as HTMLElement).clientWidth / 2;
            onChange(half ? n - 0.5 : n);
          }}
        >
          <Star className="absolute inset-0 size-6 text-muted-foreground/40" />
          <span className="absolute inset-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` }}>
            <Star className="size-6 fill-amber-400 text-amber-400" />
          </span>
        </button>
      ))}
      <span className="ml-1.5 text-sm font-semibold tabular-nums">{value.toFixed(1)}</span>
    </div>
  );
}

/** 한 줄에 하나씩 적는 목록 (좁은 패널이라 칸을 늘리지 않는다) */
function LinesInput({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState(items.join("\n"));
  const last = useRef(items.join("\n"));
  useEffect(() => {
    const next = items.join("\n");
    if (next !== last.current) setText(next);
    last.current = next;
  }, [items]);
  return (
    <Field label={label} hint="한 줄에 하나">
      <textarea
        className={cn(input, "min-h-16 resize-y leading-relaxed")}
        rows={Math.max(2, text.split("\n").length)}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const list = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
          last.current = list.join("\n");
          onChange(list);
        }}
      />
    </Field>
  );
}

/** 쿠팡 링크면 수수료가 붙는 링크인지 알려 준다. */
function LinkStatus({ url }: { url: string }) {
  const kind = coupangLinkKind(url);
  if (kind === "partners") return <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><BadgeCheck className="size-3.5" /> 쿠팡 파트너스 링크예요</p>;
  if (kind === "product") {
    return (
      <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>쿠팡 일반 주소라 수수료가 붙지 않아요. 쿠팡 파트너스에서 이 상품의 링크(link.coupang.com/a/…)를 만들어 넣어 주세요.</span>
      </p>
    );
  }
  return null;
}

function LinksInput({ links, onChange }: { links: ReviewLink[]; onChange: (v: ReviewLink[]) => void }) {
  const set = (i: number, patch: Partial<ReviewLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Field label="구매·관련 링크" hint="첫 번째가 큰 버튼" group>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="space-y-1 rounded-md border p-1.5">
            <div className="flex gap-1">
              <input className={input} value={l.label} placeholder="쿠팡에서 보기" onChange={(e) => set(i, { label: e.target.value })} />
              <button type="button" aria-label="링크 삭제" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => onChange(links.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <input
              className={input}
              value={l.url}
              placeholder="https://"
              // 파트너스 링크를 넣으면 제휴 표시를 저절로 켠다 (고지 문구가 빠지지 않게).
              onChange={(e) => set(i, { url: e.target.value, ...(coupangLinkKind(e.target.value) === "partners" ? { affiliate: true } : {}) })}
            />
            <LinkStatus url={l.url} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={l.affiliate} disabled={coupangLinkKind(l.url) === "partners"} onChange={(e) => set(i, { affiliate: e.target.checked })} /> 제휴 링크(쿠팡 파트너스)
            </label>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => onChange([...links, { label: "", url: "", affiliate: false }])}>
          <Plus /> 링크 추가
        </Button>
        {links.some((l) => l.affiliate) && <p className="text-xs text-muted-foreground">사이트에 쿠팡 파트너스 고지 문구와 rel="sponsored nofollow"가 저절로 붙어요.</p>}
      </div>
    </Field>
  );
}

const DEPLOY_BADGE: Record<DeployStatus["state"], { text: string; cls: string }> = {
  "up-to-date": { text: "사이트에 반영됨", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  "deploy-needed": { text: "사이트 빌드 중", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  unpushed: { text: "푸시 안 한 커밋 있음", cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300" },
  unknown: { text: "배포 상태 모름", cls: "bg-muted text-muted-foreground" },
};

/** 배포 상태. 게시 직후에는 사이트에 반영될 때까지 잠깐씩 다시 확인한다. */
function useDeployStatus(enabled: boolean) {
  const status = useReviewRepoStore((s) => s.deploy);
  const checking = useReviewRepoStore((s) => s.checking);
  const watchUntil = useRef(0);
  const check = useCallback(() => useReviewRepoStore.getState().refresh({ deploy: true }), []);
  useEffect(() => { if (enabled) void check(); }, [enabled, check]);
  useEffect(() => {
    if (!status || status.state === "up-to-date" || Date.now() > watchUntil.current) return;
    const timer = window.setTimeout(() => void check(), 15_000);
    return () => window.clearTimeout(timer);
  }, [status, check]);
  const watch = () => { watchUntil.current = Date.now() + 10 * 60_000; void check(); };
  return { status, checking, check, watch };
}

function PreviewDialog({ preview, onClose }: { preview: ReviewNotePreview; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="게시 미리보기" className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b px-4 py-2.5">
          <h2 className="font-semibold">게시 미리보기</h2>
          <span className="truncate font-mono text-xs text-muted-foreground">{preview.path}</span>
          <button type="button" autoFocus aria-label="닫기" onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
        </header>
        {(preview.warnings.length > 0 || preview.replaces) && (
          <ul className="space-y-0.5 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {preview.replaces && <li>예전 주소의 리뷰({preview.replaces})는 지우고 새 주소로 옮겨요.</li>}
            {preview.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{preview.markdown}</pre>
      </div>
    </div>
  );
}

/** 시리즈 이름(같은 이름끼리 묶임)과 순서, 같은 시리즈의 다른 글 */
function SeriesInput({ meta, path, name, onChange }: { meta: ReviewMeta; path: string; name: string; onChange: (p: Partial<ReviewMeta>) => void }) {
  const [entries, setEntries] = useState<ReviewSeriesEntry[]>([]);
  useEffect(() => { void api.review.listSeries().then(setEntries, () => setEntries([])); }, [path, meta.series]);
  const names = useMemo(() => [...new Set(entries.map((e) => e.series))].sort((a, b) => a.localeCompare(b, "ko")), [entries]);
  const series = meta.series?.trim();
  // 이 글은 저장 전 값으로 끼워 넣는다.
  const list = useMemo(() => {
    if (!series) return [];
    const others = entries.filter((e) => e.series === series && e.path !== path);
    return sortSeries([...others, { series, path, name, order: meta.seriesOrder ?? null, date: meta.date ?? null, published: !!meta.published }]);
  }, [entries, series, path, name, meta.seriesOrder, meta.date, meta.published]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_4.5rem] gap-2">
        <Field label="시리즈" hint="같은 이름끼리 묶여요">
          <input className={input} list="review-series-names" value={meta.series ?? ""} placeholder="없으면 비워 두기" onChange={(e) => onChange({ series: e.target.value })} />
          <datalist id="review-series-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="몇 편">
          <input
            className={input}
            type="number"
            min={1}
            disabled={!series}
            value={meta.seriesOrder ?? ""}
            placeholder={series ? String(list.findIndex((e) => e.path === path) + 1) : ""}
            onChange={(e) => onChange({ seriesOrder: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </Field>
      </div>
      {list.length > 1 && (
        <ol className="space-y-0.5 rounded-md border p-1.5 text-xs">
          {list.map((e, i) => (
            <li key={e.path}>
              <button
                type="button"
                disabled={e.path === path}
                onClick={() => useWorkspaceStore.getState().openNote(e.path)}
                className={cn("flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent disabled:cursor-default", e.path === path && "bg-accent font-medium")}
              >
                <span className="w-4 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className={cn("shrink-0", e.published ? "text-emerald-600" : "text-muted-foreground")}>{e.published ? "게시됨" : "게시 전"}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 저장소에 있는 리뷰를 작업 폴더로 가져오거나, 이미 가져온 글을 연다. */
function RepoReviews() {
  const [posts, setPosts] = useState<ReviewPostSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void api.review.list().then(setPosts, () => setPosts([])); }, []);
  if (!posts || posts.length === 0) return null;
  const open = async (postPath: string) => {
    setBusy(postPath);
    try {
      const { path, created } = await api.review.importPost(postPath);
      const ws = useWorkspaceStore.getState();
      if (created) await ws.refresh();
      ws.openNote(path);
      if (created) toast.success("작업 폴더의 '리뷰' 폴더로 가져왔어요.");
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <details className="rounded-md border px-2.5 py-1.5">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">핸디 리뷰에 있는 글 {posts.length}</summary>
      <ul className="mt-1 text-sm">
        {posts.map((p) => (
          <li key={p.path}>
            <button type="button" disabled={busy !== null} onClick={() => void open(p.path)} title="눌러서 열기 (작업 폴더에 없으면 가져와요)" className="w-full rounded px-1.5 py-1 text-left hover:bg-accent disabled:opacity-50">
              <div className="truncate">{p.title || "(제목 없음)"}</div>
              <div className="text-xs text-muted-foreground">{REVIEW_CATEGORY_LABEL[p.category]} · {p.date}</div>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 연결 탭 아래에 붙는 리뷰 설정. 글 속성에 `review`가 있을 때만 보인다. */
export function ReviewSection() {
  const activePath = useWorkspaceStore((s) => s.activePath);
  const title = useWorkspaceStore((s) => s.notes.find((n) => n.path === s.activePath)?.name ?? "");
  const hasBridge = useEditorBridge((s) => s.bridge !== null);
  const frontmatter = useEditorBridge((s) => s.frontmatter);
  const embeds = useEmbedStore((s) => s.items);
  const images = useMemo(() => embeds.filter((i) => /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(i.target)).map((i) => i.target), [embeds]);
  const config = useReviewRepoStore((s) => s.config);
  const [busy, setBusy] = useState<"preview" | "publish" | null>(null);
  const [preview, setPreview] = useState<ReviewNotePreview | null>(null);

  useEffect(() => { if (!useReviewRepoStore.getState().config) void useReviewRepoStore.getState().refresh(); }, []);
  const chooseRepo = async () => { try { useReviewRepoStore.getState().setConfig(await api.review.chooseRepo()); } catch (e) { toast.error(errText(e)); } };

  const saved = useMemo(() => readReviewMeta(frontmatter), [frontmatter]);
  const [draft, setDraft] = useState<ReviewMeta | null>(saved);
  const committed = useRef<string>(JSON.stringify(saved));
  const timer = useRef<number | undefined>(undefined);
  // 바깥(속성 표, 다른 글 열기)에서 frontmatter가 바뀌면 따라간다. 내가 쓴 값이 돌아온 것이면 그대로 둔다.
  useEffect(() => {
    const json = JSON.stringify(saved);
    if (json === committed.current) return;
    committed.current = json;
    window.clearTimeout(timer.current);
    setDraft(saved);
  }, [saved]);
  useEffect(() => () => window.clearTimeout(timer.current), [activePath]);

  const commit = (meta: ReviewMeta | null) => {
    window.clearTimeout(timer.current);
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return;
    try {
      committed.current = JSON.stringify(meta);
      bridge.setFrontmatter(writeReviewMeta(bridge.getFrontmatter(), meta));
    } catch (e) {
      toast.error(errText(e));
    }
  };
  const patch = (p: Partial<ReviewMeta>) => {
    if (!draft) return;
    const next = { ...draft, ...p };
    setDraft(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(next), COMMIT_DELAY_MS);
  };
  const flushDraft = async () => {
    if (draft) commit(draft);
    await useEditorBridge.getState().bridge?.flush();
  };

  const deploy = useDeployStatus(!!config?.repo);
  const siteUrl = (config?.deploy?.siteUrl || DEFAULT_REVIEW_SITE_URL).replace(/\/+$/, "");

  if (!activePath || !hasBridge) return null;

  if (!draft) return null;

  const fm = draft;
  const slug = reviewSlugOf(fm, title);
  const publishedSlug = fm.published ? slugOfReviewPath(fm.published) : null;
  const problems = reviewProblems(fm);
  const warnings = reviewWarnings(fm);

  const runPreview = async () => {
    setBusy("preview");
    try { await flushDraft(); setPreview(await api.review.previewNote(activePath)); } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  };
  const publish = async () => {
    if (problems.length > 0) return toast.error(problems.join("\n"));
    if (warnings.length > 0 && !window.confirm(`${warnings.join("\n\n")}\n\n그래도 게시할까요?`)) return;
    setBusy("publish");
    try {
      await flushDraft();
      const r = await api.review.publishNote(activePath);
      commit(r.meta);
      setDraft(r.meta);
      await useEditorBridge.getState().bridge?.flush();
      deploy.watch();
      toast.success(r.committed ? `게시했어요 (${r.sha.slice(0, 7)}). 사이트가 다시 빌드되면 반영돼요.` : "바뀐 내용이 없어서 푸시만 했어요.");
      for (const w of r.warnings) toast.warning(w);
    } catch (e) {
      toast.error(`게시하지 못했어요: ${errText(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const badge = deploy.status ? DEPLOY_BADGE[deploy.status.state] : null;
  return (
    <section id="review-settings" aria-label="핸디 리뷰" className="space-y-3 border-t px-4 py-3">
      <h2 className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Star className="size-3.5" /> 핸디 리뷰</h2>
      {!config?.repo ? (
        <div className="space-y-2 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
          <p>게시하려면 handy-review 저장소를 클론한 폴더를 한 번 골라 주세요.</p>
          <Button size="sm" variant="outline" onClick={() => void chooseRepo()}><FolderOpen /> 저장소 폴더 고르기</Button>
        </div>
      ) : (
        <div className="space-y-1.5 rounded-md border bg-card p-2.5">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 flex-1" disabled={busy !== null} onClick={() => void runPreview()}><Eye /> 미리보기</Button>
            <Button size="sm" className="h-7 flex-1" disabled={busy !== null} onClick={() => void publish()}>
              <Send /> {busy === "publish" ? "게시 중…" : fm.published ? "다시 게시" : "게시"}
            </Button>
          </div>
          {problems.length > 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{problems[0]}</p>
          ) : warnings.length > 0 ? (
            <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />수수료가 안 붙는 쿠팡 링크가 {warnings.length}개 있어요.</p>
          ) : null}
          <div className="flex items-center gap-1.5 text-xs">
            {publishedSlug ? (
              <a href={`${siteUrl}/review/${encodeURIComponent(publishedSlug)}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
                <ExternalLink className="size-3 shrink-0" /><span className="truncate">/review/{publishedSlug}</span>
              </a>
            ) : (
              <span className="text-muted-foreground">아직 게시 안 함</span>
            )}
            {fm.updated && <span className="shrink-0 text-muted-foreground" title="내용을 바꿔 다시 게시한 날 (게시할 때 저절로 정해요)">· 업데이트 {fm.updated.slice(5).replace("-", ".")}</span>}
            {badge && (
              <span title={deploy.status!.message} className={cn("ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5", badge.cls)}>
                {deploy.status!.state === "up-to-date" ? <CloudCheck className="size-3" /> : <CloudOff className="size-3" />}{badge.text}
              </span>
            )}
            <button type="button" aria-label="배포 상태 다시 확인" title="배포 상태 다시 확인" className={cn("rounded p-0.5 hover:bg-accent", !badge && "ml-auto")} onClick={() => void deploy.check()}>
              <RefreshCw className={cn("size-3", deploy.checking && "animate-spin")} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="분류">
          <select className={input} value={fm.category} onChange={(e) => patch({ category: e.target.value as ReviewCategory })}>
            {REVIEW_CATEGORIES.map((c) => <option key={c} value={c}>{REVIEW_CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="가격"><input className={input} value={fm.price ?? ""} placeholder="선택" onChange={(e) => patch({ price: e.target.value })} /></Field>
      </div>
      <Field label="별점" group><RatingInput value={fm.rating} onChange={(rating) => patch({ rating })} /></Field>
      <Field label="한 줄 결론"><input className={input} value={fm.verdict} placeholder="한 손으로 접히는 휴대성이 전부다." onChange={(e) => patch({ verdict: e.target.value })} /></Field>
      <Field label="추천 대상"><input className={input} value={fm.target} placeholder="대중교통이 잦은 부모" onChange={(e) => patch({ target: e.target.value })} /></Field>
      <LinesInput label="좋은 점" items={fm.pros} placeholder={"좋았던 점\n또 좋았던 점"} onChange={(pros) => patch({ pros })} />
      <LinesInput label="아쉬운 점" items={fm.cons} placeholder="아쉬웠던 점" onChange={(cons) => patch({ cons })} />
      <LinksInput links={fm.links} onChange={(links) => patch({ links })} />
      <Field label="커버 이미지" hint="첨부 이름 또는 https 주소">
        <input className={input} list="review-cover-images" value={fm.cover ?? ""} placeholder={images[0] ?? "없으면 비워 두기"} onChange={(e) => patch({ cover: e.target.value })} />
        <datalist id="review-cover-images">{images.map((i) => <option key={i} value={i} />)}</datalist>
      </Field>
      {fm.category === "place" && (
        <>
          <Field label="주소"><input className={input} value={fm.address ?? ""} onChange={(e) => patch({ address: e.target.value })} /></Field>
          <Field label="지도 링크"><input className={input} value={fm.mapUrl ?? ""} placeholder="https://" onChange={(e) => patch({ mapUrl: e.target.value })} /></Field>
          <Field label="방문일"><input className={input} type="date" value={fm.visitedAt ?? ""} onChange={(e) => patch({ visitedAt: e.target.value })} /></Field>
        </>
      )}
      {fm.category === "book" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="작가" hint="같은 작가끼리 묶여요"><input className={input} value={fm.author ?? ""} placeholder="낙락장송" onChange={(e) => patch({ author: e.target.value })} /></Field>
          <Field label="출판사"><input className={input} value={fm.publisher ?? ""} placeholder="선택" onChange={(e) => patch({ publisher: e.target.value })} /></Field>
        </div>
      )}
      {fm.category === "video" && <Field label="유튜브 영상 ID"><input className={input} value={fm.youtubeId ?? ""} placeholder="dQw4w9WgXcQ" onChange={(e) => patch({ youtubeId: e.target.value })} /></Field>}
      <SeriesInput meta={fm} path={activePath} name={title} onChange={patch} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!fm.featured} onChange={(e) => patch({ featured: e.target.checked })} /> 첫 화면 추천 리뷰</label>

      <details className="rounded-md border px-2.5 py-1.5 text-sm" open={!fm.published ? undefined : false}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">주소와 날짜</summary>
        <div className="mt-2 space-y-2">
          <Field label="주소(slug)" hint={fm.published ? "바꾸면 예전 주소는 사라져요" : "비우면 글 이름으로"}>
            <input className={input} value={fm.slug ?? ""} placeholder={slug} onChange={(e) => patch({ slug: e.target.value })} />
          </Field>
          <Field label="리뷰 날짜" hint="비우면 게시한 날"><input className={input} type="date" value={fm.date ?? ""} onChange={(e) => patch({ date: e.target.value })} /></Field>
          <p className="text-xs text-muted-foreground">제목은 글 이름, 태그는 이 글의 태그를 그대로 써요.</p>
        </div>
      </details>

      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
        onClick={() => {
          if (!window.confirm(fm.published ? "이 글의 리뷰 정보를 지울까요? 이미 게시한 사이트 글은 그대로 남아요." : "이 글의 리뷰 정보를 지울까요?")) return;
          setDraft(null);
          commit(null);
        }}
      >
        리뷰 정보 지우기
      </button>
      {config?.repo && <RepoReviews />}
      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
