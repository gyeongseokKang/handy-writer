import { DRAFT_GENRES, DRAFT_LENGTHS, DRAFT_TONES, draftGoal, outlineHeadings, type DraftBrief } from "@shared/draft";
import { findYoutubeUrls, formatDuration, youtubeVideoId, type DraftSource } from "@shared/draft-sources";
import { formatGoal, goalProgress, setFrontmatterLine, textStats } from "@shared/text-stats";
import { ArrowLeft, Check, FilePlus2, FolderCode, Loader2, MonitorPlay, RefreshCw, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useReferenceStore } from "@/entities/note/model/use-reference-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { useDraftRun, type DraftStep } from "../model/use-draft-run";

const fieldClass =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

const STEPS: { id: DraftStep; label: string }[] = [
  { id: "brief", label: "기본정보" },
  { id: "outline", label: "목차" },
  { id: "draft", label: "초안" },
];

function Choice({ label, options, value, onChange }: { label: string; options: readonly { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="space-y-1">
      <span id={`draft-${label}`} className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-labelledby={`draft-${label}`} className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-accent",
                on && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const asOptions = (values: readonly string[]) => values.map((v) => ({ id: v, label: v }));

const LENGTH_OPTIONS = [
  ...DRAFT_LENGTHS.map((l) => ({ id: l.id, label: `${l.label} (~${l.chars.toLocaleString("ko-KR")}자)` })),
  { id: "custom", label: "직접 정하기" },
];

/** 분량을 직접 정할 때: 글자 수 또는 200자 원고지 매수 */
function CustomLength({ brief, onChange }: { brief: DraftBrief; onChange: (goal: DraftBrief["customGoal"]) => void }) {
  const { unit, value } = brief.customGoal;
  return (
    <div className="flex items-center gap-1.5">
      <input
        aria-label="목표 분량"
        type="number"
        min={1}
        step={unit === "sheets" ? 1 : 100}
        value={value}
        onChange={(e) => onChange({ unit, value: Math.max(0, Number(e.target.value) || 0) })}
        className={`${fieldClass} w-28 tabular-nums`}
      />
      <select aria-label="분량 단위" value={unit} onChange={(e) => onChange({ unit: e.target.value === "sheets" ? "sheets" : "chars", value })} className={`${fieldClass} w-auto`}>
        <option value="chars">자</option>
        <option value="sheets">매 (200자 원고지)</option>
      </select>
    </div>
  );
}

/** 붙여넣은 글에 유튜브 주소가 있으면 자료로 불러온다. 주소만 붙여넣었으면 칸에는 넣지 않는다. */
function pasteYoutube(event: React.ClipboardEvent) {
  const text = event.clipboardData.getData("text").trim();
  const urls = findYoutubeUrls(text);
  if (urls.length === 0) return;
  if (urls.length === 1 && youtubeVideoId(text)) event.preventDefault();
  for (const url of urls) void useDraftRun.getState().addYoutube(url);
}

function sourceMeta(source: DraftSource) {
  if (source.kind === "project") return `${source.path} · 파일 ${source.fileCount.toLocaleString("ko-KR")}개`;
  const caption = source.transcript ? `자막 ${source.captionLabel} ${source.transcript.length.toLocaleString("ko-KR")}자` : "자막 없음";
  return [source.channel, formatDuration(source.seconds), caption].filter(Boolean).join(" · ");
}

/** 유튜브 영상과 프로젝트 폴더를 자료로 붙인다. AI가 이 자료를 바탕으로 목차와 초안을 쓴다. */
function SourcesField() {
  const sources = useDraftRun((s) => s.sources);
  const loading = useDraftRun((s) => s.loading);
  const { addYoutube, addProject, removeSource } = useDraftRun.getState();
  const [url, setUrl] = useState("");

  const submit = () => {
    if (!url.trim()) return;
    void addYoutube(url.trim());
    setUrl("");
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">
        자료 <span className="font-normal text-muted-foreground">(선택) 유튜브 영상의 자막이나 내 프로젝트를 바탕으로 써요</span>
      </span>
      <div className="flex gap-2">
        <input
          value={url}
          aria-label="유튜브 주소"
          placeholder="유튜브 주소를 붙여넣으세요"
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(event) => {
            if (findYoutubeUrls(event.clipboardData.getData("text")).length === 0) return;
            event.preventDefault();
            pasteYoutube(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              submit();
            }
          }}
          className={fieldClass}
        />
        <Button size="sm" variant="outline" className="h-8.5 shrink-0" disabled={!url.trim()} onClick={submit}>
          <MonitorPlay /> 불러오기
        </Button>
        <Button size="sm" variant="outline" className="h-8.5 shrink-0" onClick={() => void addProject()}>
          <FolderCode /> 프로젝트 폴더
        </Button>
      </div>
      {(sources.length > 0 || loading.length > 0) && (
        <ul aria-label="붙인 자료" className="divide-y rounded-md border">
          {sources.map((source, index) => (
            <li key={source.kind === "youtube" ? source.videoId : source.path} className="flex items-center gap-2.5 px-2.5 py-2">
              {source.kind === "youtube" ? <MonitorPlay className="size-4 shrink-0 text-red-500" /> : <FolderCode className="size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{source.kind === "youtube" ? source.title : source.name}</p>
                <p className="truncate text-xs text-muted-foreground">{sourceMeta(source)}</p>
              </div>
              <button type="button" aria-label={`${source.kind === "youtube" ? source.title : source.name} 빼기`} onClick={() => removeSource(index)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          {loading.map((id) => (
            <li key={id} role="status" className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 shrink-0 animate-spin" /> 영상 자막을 불러오는 중…
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 만든 초안이 목표 분량에 얼마나 맞는지 */
function DraftLengthCheck({ brief, text }: { brief: DraftBrief; text: string }) {
  const goal = draftGoal(brief);
  const stats = textStats(text);
  const percent = Math.round(goalProgress(stats, goal) * 100);
  const current = goal.unit === "sheets" ? `원고지 ${stats.sheets}매` : `${stats.chars.toLocaleString("ko-KR")}자`;
  const target = goal.unit === "sheets" ? `${goal.value}매` : `${goal.value.toLocaleString("ko-KR")}자`;
  return (
    <p aria-label="초안 분량" className="text-xs text-muted-foreground tabular-nums">
      {current} / 목표 {target} ({percent}%){goal.unit === "chars" && ` · 원고지 ${stats.sheets}매`}
      {(percent < 80 || percent > 130) && <span className="text-amber-600 dark:text-amber-400"> · 목표와 차이가 커요. 다시 쓰기를 해 보세요.</span>}
    </p>
  );
}

function BriefForm({ submitted }: { submitted: boolean }) {
  const brief = useDraftRun((s) => s.brief);
  const setBrief = useDraftRun((s) => s.setBrief);
  const topicError = submitted && !brief.topic.trim();

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="draft-topic" className="text-sm font-medium">
          주제 또는 제목 <span className="text-destructive" aria-label="필수">*</span>
        </label>
        <input id="draft-topic" autoFocus value={brief.topic} aria-invalid={topicError} placeholder="예: 처음 시작하는 사람을 위한 달리기 습관 (유튜브 주소를 붙여넣어도 돼요)" onPaste={pasteYoutube} onChange={(e) => setBrief({ topic: e.target.value })} className={fieldClass} />
        {topicError && <p className="text-xs text-destructive">주제를 입력해 주세요.</p>}
      </div>
      <Choice label="글 종류" options={asOptions(DRAFT_GENRES)} value={brief.genre} onChange={(genre) => setBrief({ genre })} />
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm font-medium">목적</span>
          <input value={brief.purpose} placeholder="예: 달리기를 시작하도록 설득" onChange={(e) => setBrief({ purpose: e.target.value })} className={fieldClass} />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">독자</span>
          <input value={brief.audience} placeholder="예: 운동을 안 하는 30대 직장인" onChange={(e) => setBrief({ audience: e.target.value })} className={fieldClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Choice label="문체" options={asOptions(DRAFT_TONES)} value={brief.tone} onChange={(tone) => setBrief({ tone })} />
        <div className="space-y-1.5">
          <Choice label="분량" options={LENGTH_OPTIONS} value={brief.length} onChange={(length) => setBrief({ length: length as typeof brief.length })} />
          {brief.length === "custom" && <CustomLength brief={brief} onChange={(customGoal) => setBrief({ customGoal })} />}
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">꼭 넣을 내용 <span className="font-normal text-muted-foreground">(선택)</span></span>
        <textarea rows={3} value={brief.keyPoints} placeholder={"핵심 주장, 예시, 자료를 적어 주세요.\n예: 하루 10분부터, 무릎 부상 주의"} onPaste={pasteYoutube} onChange={(e) => setBrief({ keyPoints: e.target.value })} className={`${fieldClass} resize-y`} />
      </label>
      <SourcesField />
      <label className="block space-y-1">
        <span className="text-sm font-medium">그 밖의 요청 <span className="font-normal text-muted-foreground">(선택)</span></span>
        <textarea rows={2} value={brief.extra} placeholder="예: 마지막에 체크리스트를 넣어 주세요" onChange={(e) => setBrief({ extra: e.target.value })} className={`${fieldClass} resize-none`} />
      </label>
    </div>
  );
}

function RunStatus() {
  const phase = useDraftRun((s) => s.phase);
  const task = useDraftRun((s) => s.task);
  const error = useDraftRun((s) => s.error);
  const status = useDraftRun((s) => s.status);
  if (phase === "error") return <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm whitespace-pre-wrap">{error}</p>;
  if (phase !== "running") return null;
  return (
    <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" /> {status || (task === "draft" ? "초안을 쓰는 중… 분량에 따라 1~3분 걸려요." : "목차를 만드는 중…")}
    </p>
  );
}

/** 기본정보 → 목차(고칠 수 있음) → 초안. 결과는 새 글로 만들거나 지금 글에 넣는다. */
export function DraftDialog() {
  const close = () => useUiStore.getState().setDraftOpen(false);
  const { step, brief, outline, draft, phase } = useDraftRun();
  const { setStep, setOutline, generate, cancel, reset } = useDraftRun.getState();
  const activePath = useWorkspaceStore((s) => s.activePath);
  const referenceCount = useReferenceStore((s) => s.paths.length + (s.includeLinked ? 1 : 0));
  const [submitted, setSubmitted] = useState(false);

  const running = phase === "running";
  const hasHeadings = outlineHeadings(outline).length > 0;

  // 창을 닫으면 진행 중인 생성을 멈춘다 (입력값과 결과는 남는다).
  useEffect(() => () => void useDraftRun.getState().cancel(), []);

  const makeOutline = () => {
    setSubmitted(true);
    if (!brief.topic.trim()) return;
    void generate("outline");
  };

  const makeDraft = () => {
    if (!hasHeadings) return void toast.error("목차에 `## 제목` 줄이 하나 이상 있어야 해요.");
    void generate("draft");
  };

  // 새 글에는 목표 분량을 frontmatter로 남겨서 아래 막대에서 진행률을 볼 수 있게 한다.
  const toNewNote = async (content: string) => {
    close();
    const frontmatter = setFrontmatterLine("", "goal", formatGoal(draftGoal(brief)));
    await useWorkspaceStore.getState().createNote("", brief.topic.trim(), `${frontmatter}\n${content}\n`);
  };

  const toCurrentNote = (content: string) => {
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return;
    const context = bridge.getContext();
    // 빈 글이면 통째로 채우고, 내용이 있으면 커서 아래에 넣는다.
    if (!context.hasSelection && !context.text.trim()) bridge.replace(context, content);
    else bridge.insertBelowCursor(content);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !running) {
      event.preventDefault();
      if (step === "brief") makeOutline();
      else if (step === "outline" && phase !== "error") makeDraft();
      else if (step === "draft" && phase === "done") void toNewNote(draft);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const result = step === "draft" ? draft : outline;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[6vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI 초안 만들기"
        className="w-full max-w-2xl space-y-4 rounded-xl border bg-card px-8 py-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">AI 초안 만들기</h2>
            <ol aria-label="단계" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {STEPS.map((s, index) => (
                <li key={s.id} aria-current={s.id === step ? "step" : undefined} className={cn("flex items-center gap-1.5", index <= stepIndex && "text-foreground", s.id === step && "font-semibold")}>
                  {index > 0 && <span aria-hidden>›</span>}
                  {index + 1}. {s.label}
                </li>
              ))}
            </ol>
          </div>
          <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        {step === "brief" ? (
          <BriefForm submitted={submitted} />
        ) : (
          <section aria-label={step === "outline" ? "목차" : "초안"} className="space-y-2">
            <p className="truncate text-sm">
              <span className="text-muted-foreground">주제 </span>
              {brief.topic}
            </p>
            {step === "outline" ? (
              <>
                <textarea
                  aria-label="목차 편집"
                  rows={14}
                  value={outline}
                  readOnly={running}
                  placeholder={running ? "" : "## 장 제목\n- 이 장에서 다룰 내용"}
                  onChange={(e) => setOutline(e.target.value)}
                  className={`${fieldClass} resize-y font-mono text-[13px] leading-6`}
                />
                {!running && phase !== "error" && <p className="text-xs text-muted-foreground">목차를 직접 고친 뒤 초안을 쓸 수 있어요. `##`는 장, `###`는 소제목, `-`는 그 부분에서 다룰 내용이에요.</p>}
              </>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto rounded-md border bg-background p-3">
                <p aria-label="생성된 초안" className="text-sm leading-7 break-words whitespace-pre-wrap">{result || "…"}</p>
              </div>
            )}
            {step === "draft" && draft && <DraftLengthCheck brief={brief} text={draft} />}
            {step === "draft" && phase === "done" && <p className="text-xs text-muted-foreground">AI가 쓴 초안이에요. `(확인 필요)` 표시와 사실은 직접 확인해 주세요.</p>}
          </section>
        )}

        <RunStatus />
        {referenceCount > 0 && step === "brief" && <p className="text-xs text-muted-foreground">AI 탭에서 고른 참고 글과 글쓰기 룰도 함께 보내요.</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex gap-2">
            {step === "brief" ? (
              <Button size="sm" variant="ghost" onClick={() => { reset(); setSubmitted(false); }}>
                <RotateCcw /> 입력 지우기
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={running} onClick={() => setStep(step === "draft" ? "outline" : "brief")}>
                <ArrowLeft /> {step === "draft" ? "목차" : "기본정보"}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button size="sm" variant="outline" onClick={() => void cancel()}>
                <Square /> 중지
              </Button>
            ) : step === "brief" ? (
              <>
                {hasHeadings && (
                  <Button size="sm" variant="outline" onClick={() => setStep("outline")}>
                    만든 목차 보기
                  </Button>
                )}
                <Button size="sm" onClick={makeOutline}>
                  {hasHeadings ? "목차 새로 만들기" : "목차 만들기"}
                </Button>
              </>
            ) : step === "outline" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => void generate("outline")}>
                  <RefreshCw /> 다시 만들기
                </Button>
                <Button size="sm" variant="outline" disabled={!hasHeadings} onClick={() => void toNewNote(outline)}>
                  <FilePlus2 /> 목차만 새 글로
                </Button>
                <Button size="sm" disabled={!hasHeadings} onClick={makeDraft}>
                  이 목차로 초안 쓰기
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={makeDraft}>
                  <RefreshCw /> 다시 쓰기
                </Button>
                {activePath && (
                  <Button size="sm" variant="outline" disabled={phase !== "done"} onClick={() => toCurrentNote(draft)}>
                    지금 글에 넣기
                  </Button>
                )}
                <Button size="sm" disabled={phase !== "done"} onClick={() => void toNewNote(draft)}>
                  <Check /> 새 글로 만들기
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
