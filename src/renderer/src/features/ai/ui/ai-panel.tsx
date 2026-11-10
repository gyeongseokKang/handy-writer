import { BookOpen, Check, ChevronRight, Copy, CopyPlus, FileText, History, ListChecks, Loader2, PenLine, Plus, ScanText, SpellCheck, Sparkles, Square, TextCursorInput, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { outgoingOf } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useReferenceStore } from "@/entities/note/model/use-reference-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { DEFAULT_REVISE_RULES } from "@shared/ai-prompt";

import { TASK_LABEL, useAiStore } from "../model/use-ai-store";
import { ReviseButton } from "./revise-button";

const RULES_PLACEHOLDER = `예)
- 존댓말(합니다체)로 쓴다
- 한 문장은 60자를 넘기지 않는다
- 추상적인 표현보다 구체적인 사례를 쓴다
- 문단은 3~4문장으로 끝낸다`;

const fieldClass =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded bg-muted px-2 py-1 font-mono text-xs">
      <code className="min-w-0 flex-1 break-all">{text}</code>
      <button
        type="button"
        className="shrink-0 font-sans text-muted-foreground hover:text-foreground"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

/** Claude Code를 쓸 수 없을 때 무엇을 하면 되는지 순서대로 안내한다. */
function StatusNotice() {
  const status = useAiStore((s) => s.status);
  const refreshStatus = useAiStore((s) => s.refreshStatus);
  const unavailable = status !== null && !status.available;

  // 터미널에서 설치·로그인을 마치고 돌아오면 알아서 다시 확인한다.
  useEffect(() => {
    if (!unavailable) return;
    const onFocus = () => void refreshStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [unavailable, refreshStatus]);

  if (!status || status.available) return null;
  return (
    <div role="alert" className="mx-4 mt-3 space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">{status.reason}</p>
      {status.problem === "missing" && (
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer" className="underline">Claude Code</a>를 설치해요. 터미널에서:
            <div className="mt-1"><Command text="npm install -g @anthropic-ai/claude-code" /></div>
          </li>
          <li>
            터미널에서 <code>claude</code>를 실행하고 안내대로 로그인해요(<code>/login</code>).
          </li>
          <li>이 앱으로 돌아와 <strong>다시 확인</strong>을 눌러요.</li>
        </ol>
      )}
      {status.problem === "login" && (
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            터미널에서 실행해요:
            <div className="mt-1"><Command text="claude" /></div>
          </li>
          <li>
            열리면 <code>/login</code>을 입력하고 브라우저에서 로그인해요.
          </li>
          <li>이 앱으로 돌아오면 자동으로 다시 확인해요.</li>
        </ol>
      )}
      {status.problem === "error" && <p className="text-muted-foreground">터미널에서 <code>claude --version</code>이 되는지 확인해 주세요.</p>}
      <p className="text-xs text-muted-foreground">API 키는 필요 없어요. AI를 쓰면 요청한 글이 내 컴퓨터의 <code>claude</code>를 거쳐 Anthropic으로 전송돼요.</p>
      <Button size="sm" variant="outline" onClick={() => void refreshStatus()}>
        다시 확인
      </Button>
    </div>
  );
}

function References() {
  const notes = useWorkspaceStore((s) => s.notes);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const entries = useNoteIndexStore((s) => s.entries);
  const paths = useReferenceStore((s) => s.paths);
  const includeLinked = useReferenceStore((s) => s.includeLinked);
  const addReference = useReferenceStore((s) => s.add);
  const removeReference = useReferenceStore((s) => s.remove);
  const setIncludeLinked = useReferenceStore((s) => s.setIncludeLinked);
  const [query, setQuery] = useState("");

  const linkedCount = useMemo(() => {
    const entry = entries.find((e) => e.path === activePath);
    return entry ? outgoingOf(entries, entry).filter((l) => l.path).length : 0;
  }, [entries, activePath]);

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return notes
      .filter((note) => note.path !== activePath && !paths.includes(note.path) && note.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [notes, query, activePath, paths]);

  const nameOf = (path: string) => notes.find((note) => note.path === path)?.name ?? path;

  return (
    <section className="space-y-2 px-4 py-3">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <BookOpen className="size-3.5" /> 참고할 글
      </h2>
      {paths.length > 0 && (
        <ul aria-label="참고할 글" className="flex flex-wrap gap-1.5">
          {paths.map((path) => (
            <li key={path} className="flex items-center gap-1 rounded-full bg-accent py-0.5 pr-1 pl-2.5 text-xs">
              {nameOf(path)}
              <button type="button" aria-label={`${nameOf(path)} 빼기`} onClick={() => removeReference(path)} className="rounded-full p-0.5 hover:bg-background">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="글 이름으로 찾아서 추가"
          aria-label="참고할 글 찾기"
          className={fieldClass}
        />
        {candidates.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-card p-1 shadow-lg">
            {candidates.map((note) => (
              <li key={note.path}>
                <button
                  type="button"
                  onClick={() => {
                    addReference(note.path);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span className="truncate">{note.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeLinked} onChange={(event) => setIncludeLinked(event.target.checked)} />
        이 글이 링크한 글도 참고 <span className="text-xs text-muted-foreground">({linkedCount})</span>
      </label>
    </section>
  );
}

/** 룰 한 칸 (글쓰기 룰·퇴고 룰). 접어 두어도 무엇이 적혀 있는지 머리줄에 줄 수와 첫 줄이 보인다. */
function RulesEditor({ icon, title, label, value, saved, onChange, onSave, placeholder, file, emptyHint }: {
  icon: React.ReactNode; title: string; label: string; value: string; saved: string; onChange: (v: string) => void; onSave: () => void;
  placeholder: string; file: string; emptyHint: string;
}) {
  const dirty = value !== saved;
  const lines = saved.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0]?.replace(/^[-*•]\s*/, "") ?? "";
  return (
    <details className="group px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted-foreground select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {icon} {title}
        {lines.length > 0 ? (
          <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">{lines.length}줄</span>
        ) : (
          <span className="ml-auto shrink-0 text-[10px] font-normal">{emptyHint}</span>
        )}
        {dirty && <span className="shrink-0 text-[10px] font-normal text-amber-600" title="저장 안 한 변경이 있어요">● 저장 안 함</span>}
      </summary>
      {first && <p className="mt-1 truncate pl-5 text-[11px] text-muted-foreground group-open:hidden" title={lines.join("\n")}>{first}{lines.length > 1 ? ` 외 ${lines.length - 1}줄` : ""}</p>}
      <div className="mt-2 space-y-2">
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} rows={8} className={`${fieldClass} resize-y`} />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">작업 폴더의 {file}에 저장돼요</p>
          <Button size="sm" disabled={!dirty} onClick={onSave}>저장</Button>
        </div>
      </div>
    </details>
  );
}

function Rules() {
  const rules = useAiStore((s) => s.rules);
  const saved = useAiStore((s) => s.rulesSaved);
  const { setRules, saveRules } = useAiStore.getState();
  return (
    <RulesEditor icon={<PenLine className="size-3.5" />} title="나의 글쓰기 룰" label="글쓰기 룰" value={rules} saved={saved} onChange={setRules} onSave={() => void saveRules()}
      placeholder={RULES_PLACEHOLDER} file=".handy-writer/rules.md" emptyHint="비어 있음" />
  );
}

/** 퇴고 기준. 비어 있으면 기본 퇴고 기준을 쓴다. */
function ReviseRules() {
  const rules = useAiStore((s) => s.reviseRules);
  const saved = useAiStore((s) => s.reviseRulesSaved);
  const { setReviseRules, saveReviseRules } = useAiStore.getState();
  return (
    <RulesEditor icon={<ListChecks className="size-3.5" />} title="나의 퇴고 룰" label="퇴고 룰" value={rules} saved={saved} onChange={setReviseRules} onSave={() => void saveReviseRules()}
      placeholder={`비워 두면 이 기본 기준으로 퇴고해요\n${DEFAULT_REVISE_RULES}`} file=".handy-writer/revise-rules.md" emptyHint="기본 기준 사용" />
  );
}

function Result() {
  const run = useAiStore((s) => s.run);
  const apply = useAiStore((s) => s.apply);
  const cancel = useAiStore((s) => s.cancel);
  const dismiss = useAiStore((s) => s.dismiss);

  if (run.phase === "idle" || !run.task) return null;
  // 퇴고 결과는 본문 자리의 큰 화면(RevisionView)에서 본다.
  if (run.task === "revise" || run.task === "proofread" || run.task === "polish") {
    return (
      <section aria-label="AI 결과" className="px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm">
          {run.phase === "running" && <Loader2 className="size-4 animate-spin" />}
          <span className="font-semibold">{TASK_LABEL[run.task]}</span>
          <span className="text-xs text-muted-foreground">{run.phase === "running" ? "본문 화면에서 고치는 중…" : run.phase === "done" ? "본문 화면에서 바뀐 점을 확인하세요" : "실패"}</span>
        </p>
      </section>
    );
  }

  const canReplace = run.task !== "continue";
  const copy = () => void navigator.clipboard.writeText(run.output).then(() => toast.success("결과를 복사했어요."));

  return (
    <section aria-label="AI 결과" className="space-y-3 px-4 py-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          {run.phase === "running" && <Loader2 className="size-4 animate-spin" />}
          {TASK_LABEL[run.task]}
          <span className="text-xs font-normal text-muted-foreground">
            {run.phase === "running" ? "생성 중…" : run.phase === "done" ? "완료" : "실패"}
          </span>
        </h2>
      </div>

      {run.phase === "error" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm whitespace-pre-wrap">
          {run.error}
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-md border bg-background p-3">
          <p aria-label="결과 글" className="text-sm leading-7 break-words whitespace-pre-wrap">
            {run.output || "…"}
          </p>
        </div>
      )}


      <div className="flex flex-wrap gap-2">
        {run.phase === "running" && (
          <Button size="sm" variant="outline" onClick={() => void cancel()}>
            <Square /> 중지
          </Button>
        )}
        {run.phase === "done" && (
          <>
            {canReplace && (
              <Button size="sm" onClick={() => apply("replace")}>
                <Check /> {run.context?.hasSelection ? "선택 부분에 적용" : "본문 전체에 적용"}
              </Button>
            )}
            {run.task === "continue" && (
              <Button size="sm" onClick={() => apply("cursor")} title="커서가 있던 문단에 바로 이어서 써 넣어요">
                <TextCursorInput /> 이어 붙이기
              </Button>
            )}
            <Button size="sm" variant={canReplace || run.task === "continue" ? "outline" : "default"} onClick={() => apply("below")}>
              <CopyPlus /> 아래에 삽입
            </Button>
            <Button size="sm" variant="outline" onClick={copy}>
              복사
            </Button>
          </>
        )}
        {run.phase !== "running" && (
          <Button size="sm" variant="ghost" onClick={dismiss}>
            닫기
          </Button>
        )}
      </div>
    </section>
  );
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

/** 끝난 결과 기록: 적용하거나 닫아도 남아서 다시 펼쳐 보고 복사·삽입한다. 작업 폴더마다 따로 기억한다. */
function HistoryList() {
  const history = useAiStore((s) => s.history);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [scope, setScope] = useState<"note" | "all">("note");
  const [openId, setOpenId] = useState<string | null>(null);
  const mine = history.filter((i) => i.notePath === activePath);
  const shown = scope === "note" ? mine : history;
  if (history.length === 0) return null;
  const { removeHistory, insertHistory, clearHistory } = useAiStore.getState();
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success("결과를 복사했어요."));

  return (
    <section aria-label="지난 AI 결과" className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><History className="size-3.5" /> 지난 결과</h2>
        <div role="tablist" aria-label="기록 범위" className="ml-auto flex rounded-md bg-muted p-0.5 text-[11px]">
          {(["note", "all"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              onClick={() => setScope(key)}
              className={cn("rounded px-2 py-0.5 text-muted-foreground", scope === key && "bg-background text-foreground shadow-sm")}
            >
              {key === "note" ? `이 글 ${mine.length}` : `전체 ${history.length}`}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">이 글에서 받은 결과가 아직 없어요.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className="rounded-md border bg-background">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left hover:bg-accent/50"
                >
                  <ChevronRight className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium">{TASK_LABEL[item.task]}</span>
                      <span className="text-muted-foreground">{timeAgo(item.at)}</span>
                      {scope === "all" && item.noteName && <span className="truncate text-muted-foreground">· {item.noteName}</span>}
                    </span>
                    {!open && <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.output}</span>}
                  </span>
                </button>
                {open && (
                  <div className="space-y-2 border-t px-2 py-2">
                    {item.instruction && <p className="text-[11px] text-muted-foreground">요청: {item.instruction}</p>}
                    {item.notes?.length ? (
                      <ol aria-label="고친 점" className="list-decimal space-y-0.5 rounded bg-muted/40 py-1.5 pr-2 pl-6 text-[11px] leading-5 text-muted-foreground">
                        {item.notes.map((note, i) => <li key={i}>{note}</li>)}
                      </ol>
                    ) : null}
                    <p aria-label="지난 결과 글" className="max-h-72 overflow-y-auto text-sm leading-7 break-words whitespace-pre-wrap">{item.output}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => insertHistory(item.id)}><CopyPlus /> 아래에 삽입</Button>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => copy(item.output)}><Copy /> 복사</Button>
                      <Button size="sm" variant="ghost" className="ml-auto h-7 text-muted-foreground" onClick={() => removeHistory(item.id)}><Trash2 /> 지우기</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {scope === "all" && history.length > 1 && (
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline"
          onClick={() => window.confirm("지난 AI 결과를 모두 지울까요?") && clearHistory()}
        >
          기록 모두 지우기
        </button>
      )}
    </section>
  );
}

export function AiPanel() {
  const status = useAiStore((s) => s.status);
  const running = useAiStore((s) => s.run.phase === "running");
  const instruction = useAiStore((s) => s.instruction);
  const setInstruction = useAiStore((s) => s.setInstruction);
  const start = useAiStore((s) => s.start);
  const refreshStatus = useAiStore((s) => s.refreshStatus);
  const loadRules = useAiStore((s) => s.loadRules);
  const root = useWorkspaceStore((s) => s.root);

  useEffect(() => void refreshStatus(), [refreshStatus]);
  useEffect(() => void loadRules(), [loadRules, root]);
  useEffect(() => useAiStore.getState().loadHistory(root), [root]);

  const disabled = running || status?.available === false;

  return (
    <div role="region" aria-label="AI 도우미" className="flex flex-col divide-y">
      <StatusNotice />

      <section className="space-y-3 px-4 py-3">
        <p className="text-xs text-muted-foreground">글을 선택하면 선택한 부분만, 선택이 없으면 본문 전체를 대상으로 해요.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void start("proofread")}>
            <SpellCheck /> 맞춤법 교정
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void start("polish")}>
            <Sparkles /> 다듬기
          </Button>
          <ReviseButton disabled={disabled} />
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void start("continue")}>
            <TextCursorInput /> 이어쓰기
          </Button>
          <Button variant="outline" size="sm" className="col-span-2" disabled={disabled} onClick={() => void start("custom")}>
            지시대로 처리
          </Button>
        </div>
        <Button variant="outline" size="sm" className="w-full" disabled={status?.available === false} onClick={() => useUiStore.getState().setDraftOpen(true)}>
          <FileText /> 기본정보로 목차·초안 만들기
        </Button>
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="추가 요청 또는 지시 (예: 더 간결하게, 첫 문장을 질문으로)"
          aria-label="추가 요청"
          rows={2}
          className={`${fieldClass} resize-none`}
        />
      </section>

      <Result />
      <HistoryList />
      <References />
      <Rules />
      <ReviseRules />
    </div>
  );
}
