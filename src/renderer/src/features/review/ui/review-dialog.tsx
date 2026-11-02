import { CloudCheck, CloudOff, FolderOpen, Plus, RefreshCw, Save, Send, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { toast } from "sonner";

import {
  REVIEW_CATEGORIES, REVIEW_CATEGORY_LABEL,
  type DeployStatus, type ReviewCategory, type ReviewFrontmatter, type ReviewLink, type ReviewPost, type ReviewPostSummary,
} from "@shared/review";
import type { ReviewConfig } from "@shared/types";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { api } from "@/shared/api/handy-api";
import { Button } from "@/shared/ui/button";

const input = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n}점`} className="relative size-6" onClick={(e) => {
          const half = e.nativeEvent.offsetX < (e.currentTarget as HTMLElement).clientWidth / 2;
          onChange(half ? n - 0.5 : n);
        }}>
          <Star className="absolute inset-0 size-6 text-muted-foreground/40" />
          <span className="absolute inset-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` }}>
            <Star className="size-6 fill-amber-400 text-amber-400" />
          </span>
        </button>
      ))}
      <span className="ml-2 w-8 text-sm font-semibold">{value.toFixed(1)}</span>
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange(0)}>0점</button>
    </div>
  );
}

function ListInput({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-1.5">
            <input className={input} value={item} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" aria-label="삭제" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...items, ""])}><Plus /> 추가</Button>
      </div>
    </Field>
  );
}

function LinksInput({ links, onChange }: { links: ReviewLink[]; onChange: (v: ReviewLink[]) => void }) {
  const set = (i: number, patch: Partial<ReviewLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Field label="구매·관련 링크 (첫 번째가 메인 버튼)">
      <div className="space-y-1.5">
        {links.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <input className={`${input} w-32 flex-none`} value={l.label} placeholder="쿠팡에서 보기" onChange={(e) => set(i, { label: e.target.value })} />
            <input className={`${input} min-w-0 flex-1`} value={l.url} placeholder="https://" onChange={(e) => set(i, { url: e.target.value })} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={l.affiliate} onChange={(e) => set(i, { affiliate: e.target.checked })} /> 제휴(쿠팡 파트너스)</label>
            <button type="button" aria-label="삭제" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => onChange(links.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...links, { label: "", url: "", affiliate: false }])}><Plus /> 링크 추가</Button>
        {links.some((l) => l.affiliate) && <p className="text-xs text-muted-foreground">제휴 링크가 있으면 사이트에 쿠팡 파트너스 고지 문구와 rel="sponsored nofollow"가 자동으로 붙어요.</p>}
      </div>
    </Field>
  );
}

const DEPLOY_BADGE: Record<DeployStatus["state"], { text: string; cls: string }> = {
  "up-to-date": { text: "최신 배포됨", cls: "bg-emerald-100 text-emerald-800" },
  "deploy-needed": { text: "배포 필요", cls: "bg-amber-100 text-amber-900" },
  unpushed: { text: "게시 안 한 커밋 있음", cls: "bg-sky-100 text-sky-900" },
  unknown: { text: "배포 상태 모름", cls: "bg-muted text-muted-foreground" },
};

function DeployBar({ config, onConfig }: { config: ReviewConfig; onConfig: (c: ReviewConfig) => void }) {
  const [status, setStatus] = useState<DeployStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [site, setSite] = useState(config.deploy?.siteUrl ?? "");
  const check = useCallback(async () => {
    setChecking(true);
    try { setStatus(await api.review.deployStatus()); } catch (e) { toast.error(errText(e)); } finally { setChecking(false); }
  }, []);
  useEffect(() => { void check(); }, [check, config.deploy?.siteUrl]);
  const saveSite = async () => {
    const url = site.trim();
    onConfig(await api.review.setDeploy(url ? { kind: "vercel-version-json", siteUrl: url } : null));
  };
  const badge = status ? DEPLOY_BADGE[status.state] : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input className={`${input} w-64 py-1 text-xs`} value={site} placeholder="사이트 주소 (예: https://review.도메인)" onChange={(e) => setSite(e.target.value)} onBlur={() => void saveSite()} onKeyDown={(e) => e.key === "Enter" && void saveSite()} />
      {badge && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${badge.cls}`} title={`${status!.message}\n배포: ${status!.deployedSha?.slice(0, 7) ?? "-"} / 원격: ${status!.remoteSha?.slice(0, 7) ?? "-"} / 로컬: ${status!.localSha?.slice(0, 7) ?? "-"}`}>
          {status!.state === "up-to-date" ? <CloudCheck className="size-3.5" /> : <CloudOff className="size-3.5" />}
          {badge.text}{status!.state === "deploy-needed" && status!.behindBy ? ` (${status!.behindBy}개 뒤처짐)` : ""}
        </span>
      )}
      <button type="button" aria-label="배포 상태 다시 확인" className="rounded p-1 hover:bg-accent" onClick={() => void check()}><RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} /></button>
      {status?.state === "deploy-needed" && <span className="text-muted-foreground">Vercel 배포가 아직 반영되지 않았어요. Vercel 대시보드에서 빌드 상태를 확인해 주세요.</span>}
    </div>
  );
}

export function ReviewDialog() {
  const close = () => useUiStore.getState().setReviewOpen(false);
  const [config, setConfig] = useState<ReviewConfig | null>(null);
  const [posts, setPosts] = useState<ReviewPostSummary[]>([]);
  const [post, setPost] = useState<ReviewPost | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [newCategory, setNewCategory] = useState<ReviewCategory>("baby");
  const [newTitle, setNewTitle] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => { try { setPosts(await api.review.list()); } catch (e) { toast.error(errText(e)); } }, []);
  useEffect(() => { void api.review.getConfig().then(setConfig); }, []);
  useEffect(() => { if (config?.repo) void refresh(); }, [config?.repo, refresh]);

  const chooseRepo = async () => { try { setConfig(await api.review.chooseRepo()); } catch (e) { toast.error(errText(e)); } };
  const patch = (p: Partial<ReviewFrontmatter>) => { setPost((cur) => (cur ? { ...cur, frontmatter: { ...cur.frontmatter, ...p } } : cur)); setDirty(true); };

  const create = async () => {
    if (!newTitle.trim()) return toast.error("제목을 넣어 주세요.");
    try { const p = await api.review.create(newCategory, newTitle.trim()); setPost(p); setDirty(false); setNewTitle(""); await refresh(); }
    catch (e) { toast.error(errText(e)); }
  };
  const open = async (path: string) => {
    if (dirty && !window.confirm("저장하지 않은 내용이 있어요. 버릴까요?")) return;
    try { setPost(await api.review.read(path)); setDirty(false); } catch (e) { toast.error(errText(e)); }
  };
  const save = async () => {
    if (!post) return;
    setBusy("save");
    try { await api.review.write(post); setDirty(false); await refresh(); toast.success("저장했어요."); } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  };
  const publish = async () => {
    if (!post) return;
    const fm = post.frontmatter;
    if (!fm.verdict.trim() || !fm.target.trim()) return toast.error("한 줄 결론과 추천 대상을 채워 주세요.");
    setBusy("publish");
    try {
      await api.review.write(post);
      setDirty(false);
      const r = await api.review.publish(post.path);
      toast.success(r.committed ? `게시했어요 (${r.sha.slice(0, 7)}). Vercel이 배포하면 사이트에 반영돼요.` : "바뀐 내용이 없어서 푸시만 했어요.");
    } catch (e) { toast.error(`게시 실패: ${errText(e)}`); } finally { setBusy(null); }
  };

  const onPaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!post) return;
    const files = [...event.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    const el = event.currentTarget;
    const at = el.selectionStart;
    let insert = "";
    for (const file of files) {
      try {
        const rel = await api.review.saveImage(post.path, file.name || `image.${file.type.split("/")[1] ?? "png"}`, new Uint8Array(await file.arrayBuffer()));
        insert += `\n![](${rel})\n`;
      } catch (e) { toast.error(errText(e)); }
    }
    const body = post.body.slice(0, at) + insert + post.body.slice(el.selectionEnd);
    setPost({ ...post, body });
    setDirty(true);
  };

  const fm = post?.frontmatter;
  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 p-4" onKeyDown={(e) => { if (e.key === "Escape") close(); if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); void save(); } }}>
      <div role="dialog" aria-modal="true" aria-label="리뷰 글 쓰기" className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <h2 className="flex items-center gap-1.5 font-semibold"><Star className="size-4" /> 리뷰 글 쓰기</h2>
          <Button size="sm" variant="outline" onClick={() => void chooseRepo()}><FolderOpen /> {config?.repo ? config.repo.split(/[\\/]/).pop() : "리뷰 저장소 고르기"}</Button>
          {config?.repo && <DeployBar config={config} onConfig={setConfig} />}
          <button type="button" aria-label="닫기" onClick={close} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
        </header>

        {!config?.repo ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <p>핸디 리뷰 저장소(handy-review)를 클론한 폴더를 골라 주세요.</p>
            <Button onClick={() => void chooseRepo()}><FolderOpen /> 폴더 고르기</Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-64 flex-none flex-col border-r">
              <div className="space-y-1.5 border-b p-3">
                <select className={input} value={newCategory} onChange={(e) => setNewCategory(e.target.value as ReviewCategory)}>
                  {REVIEW_CATEGORIES.map((c) => <option key={c} value={c}>{REVIEW_CATEGORY_LABEL[c]}</option>)}
                </select>
                <input className={input} value={newTitle} placeholder="새 리뷰 제목" onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} />
                <Button size="sm" className="w-full" onClick={() => void create()}><Plus /> 새 리뷰</Button>
              </div>
              <ul className="flex-1 overflow-y-auto p-1.5 text-sm">
                {posts.map((p) => (
                  <li key={p.path}>
                    <button type="button" onClick={() => void open(p.path)} className={`w-full rounded px-2 py-1.5 text-left hover:bg-accent ${post?.path === p.path ? "bg-accent" : ""}`}>
                      <div className="truncate">{p.title || "(제목 없음)"}</div>
                      <div className="text-xs text-muted-foreground">{REVIEW_CATEGORY_LABEL[p.category]} · {p.date}</div>
                    </button>
                  </li>
                ))}
                {posts.length === 0 && <li className="p-2 text-xs text-muted-foreground">아직 리뷰가 없어요.</li>}
              </ul>
            </aside>

            {!post || !fm ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">왼쪽에서 리뷰를 고르거나 새로 만들어 보세요.</div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
                  <button type="button" className="truncate font-mono hover:underline" onClick={() => void api.review.reveal(post.path)}>{post.path}</button>
                  {dirty && <span className="text-amber-600">저장 안 됨</span>}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void save()}><Save /> 저장</Button>
                    <Button size="sm" disabled={busy !== null} onClick={() => void publish()}><Send /> {busy === "publish" ? "게시 중…" : "게시"}</Button>
                  </div>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(320px,420px)_1fr]">
                  <div className="space-y-3 border-r p-4">
                    <Field label="제목"><input className={input} value={fm.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
                    <Field label="별점"><RatingInput value={fm.rating} onChange={(rating) => patch({ rating })} /></Field>
                    <Field label="한 줄 결론"><input className={input} value={fm.verdict} placeholder="한 손으로 접히는 휴대성이 전부다." onChange={(e) => patch({ verdict: e.target.value })} /></Field>
                    <Field label="추천 대상"><input className={input} value={fm.target} placeholder="대중교통이 잦은 부모" onChange={(e) => patch({ target: e.target.value })} /></Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="가격 (선택)"><input className={input} value={fm.price ?? ""} onChange={(e) => patch({ price: e.target.value })} /></Field>
                      <Field label="날짜"><input className={input} type="date" value={fm.date} onChange={(e) => patch({ date: e.target.value })} /></Field>
                    </div>
                    <ListInput label="좋은 점" items={fm.pros} placeholder="좋았던 점" onChange={(pros) => patch({ pros })} />
                    <ListInput label="아쉬운 점" items={fm.cons} placeholder="아쉬웠던 점" onChange={(cons) => patch({ cons })} />
                    <LinksInput links={fm.links} onChange={(links) => patch({ links })} />
                    <Field label="태그 (쉼표로 구분)"><input className={input} value={fm.tags.join(", ")} onChange={(e) => patch({ tags: e.target.value.split(",").map((t) => t.trim()) })} /></Field>
                    <Field label="커버 이미지 (선택, /images/... 또는 https://)"><input className={input} value={fm.cover ?? ""} onChange={(e) => patch({ cover: e.target.value })} /></Field>
                    {fm.category === "place" && (
                      <>
                        <Field label="주소"><input className={input} value={fm.address ?? ""} onChange={(e) => patch({ address: e.target.value })} /></Field>
                        <Field label="지도 링크"><input className={input} value={fm.mapUrl ?? ""} onChange={(e) => patch({ mapUrl: e.target.value })} /></Field>
                        <Field label="방문일"><input className={input} type="date" value={fm.visitedAt ?? ""} onChange={(e) => patch({ visitedAt: e.target.value })} /></Field>
                      </>
                    )}
                    {fm.category === "video" && <Field label="유튜브 영상 ID"><input className={input} value={fm.youtubeId ?? ""} placeholder="dQw4w9WgXcQ" onChange={(e) => patch({ youtubeId: e.target.value })} /></Field>}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!fm.featured} onChange={(e) => patch({ featured: e.target.checked })} /> 첫 화면 추천 리뷰로 보이기</label>
                  </div>
                  <div className="flex min-h-[400px] flex-col p-4">
                    <span className="mb-1 text-xs font-medium text-muted-foreground">본문 (마크다운 · [[다른-리뷰-슬러그]]로 연결 · 이미지를 붙여넣으면 글 옆 폴더에 복사돼요)</span>
                    <textarea ref={bodyRef} className={`${input} flex-1 resize-none font-mono leading-relaxed`} value={post.body} onPaste={(e) => void onPaste(e)} onChange={(e) => { setPost({ ...post, body: e.target.value }); setDirty(true); }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
