import { BookOpen, Check, CopyPlus, Loader2, PenLine, Plus, SpellCheck, Sparkles, Square, TextCursorInput, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { outgoingOf } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { Button } from "@/shared/ui/button";

import { TASK_LABEL, useAiStore } from "../model/use-ai-store";
import { DiffView } from "./diff-view";

const RULES_PLACEHOLDER = `예)
- 존댓말(합니다체)로 쓴다
- 한 문장은 60자를 넘기지 않는다
- 추상적인 표현보다 구체적인 사례를 쓴다
- 문단은 3~4문장으로 끝낸다`;

const fieldClass =
  "w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function StatusNotice() {
  const status = useAiStore((s) => s.status);
  const refreshStatus = useAiStore((s) => s.refreshStatus);
  if (!status || status.available) return null;
  return (
    <div role="alert" className="mx-4 mt-3 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p>{status.reason}</p>
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
  const paths = useAiStore((s) => s.referencePaths);
  const includeLinked = useAiStore((s) => s.includeLinked);
  const addReference = useAiStore((s) => s.addReference);
  const removeReference = useAiStore((s) => s.removeReference);
  const setIncludeLinked = useAiStore((s) => s.setIncludeLinked);
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

function Rules() {
  const rules = useAiStore((s) => s.rules);
  const saved = useAiStore((s) => s.rulesSaved);
  const setRules = useAiStore((s) => s.setRules);
  const saveRules = useAiStore((s) => s.saveRules);
  const dirty = rules !== saved;

  return (
    <details className="group px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted-foreground select-none">
        <PenLine className="size-3.5" /> 나의 글쓰기 룰 {saved.trim() ? "" : "(비어 있음)"}
      </summary>
      <div className="mt-2 space-y-2">
        <textarea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder={RULES_PLACEHOLDER}
          aria-label="글쓰기 룰"
          rows={8}
          className={`${fieldClass} resize-y`}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">작업 폴더의 .handy-writer/rules.md에 저장돼요</p>
          <Button size="sm" disabled={!dirty} onClick={() => void saveRules()}>
            저장
          </Button>
        </div>
      </div>
    </details>
  );
}

function Result() {
  const run = useAiStore((s) => s.run);
  const apply = useAiStore((s) => s.apply);
  const cancel = useAiStore((s) => s.cancel);
  const dismiss = useAiStore((s) => s.dismiss);
  const [showDiff, setShowDiff] = useState(true);

  if (run.phase === "idle" || !run.task) return null;

  const canReplace = run.task !== "continue";
  const canDiff = run.task === "proofread" || run.task === "polish";
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
        {canDiff && run.phase === "done" && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? "결과만 보기" : "변경 보기"}
          </button>
        )}
      </div>

      {run.phase === "error" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm whitespace-pre-wrap">
          {run.error}
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-md border bg-background p-3">
          {canDiff && run.phase === "done" && showDiff && run.context ? (
            <DiffView original={run.context.text} result={run.output} />
          ) : (
            <p aria-label="결과 글" className="text-sm leading-7 break-words whitespace-pre-wrap">
              {run.output || "…"}
            </p>
          )}
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
            <Button size="sm" variant={canReplace ? "outline" : "default"} onClick={() => apply("below")}>
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
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void start("continue")}>
            <TextCursorInput /> 이어쓰기
          </Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void start("custom")}>
            지시대로 처리
          </Button>
        </div>
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
      <References />
      <Rules />
    </div>
  );
}
