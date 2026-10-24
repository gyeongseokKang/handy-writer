import {
  blockTitle,
  CONTEXT_SCOPES,
  defaultInputs,
  validateInputs,
  type ContextScope,
  type Template,
} from "@shared/templates";
import { Check, Globe, Loader2, RefreshCw, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEditorBridge, type TemplateBlockAttrs } from "@/entities/note/model/use-editor-bridge";
import { useReferenceStore } from "@/entities/note/model/use-reference-store";
import { useTemplateDialogStore, type TemplateDialogRequest } from "@/entities/template/model/use-template-dialog-store";
import { useTemplateStore } from "@/entities/template/model/use-template-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

import { useTemplateRun } from "../model/use-template-run";

const fieldClass =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

const MAX_PREFILL = 200;

type RunRequest = Extract<TemplateDialogRequest, { mode: "new" | "regenerate" }>;

interface Initial {
  template: Template;
  inputs: Record<string, string>;
  extra: string;
  scope: ContextScope;
  web: boolean;
}

/** 요청(새 블록 / 다시 생성)에서 템플릿과 처음 채울 값을 정한다. 템플릿을 못 찾으면 null. */
function resolveInitial(request: RunRequest, templates: Template[]): Initial | { error: string } {
  const bridge = useEditorBridge.getState().bridge;
  if (!bridge) return { error: "에디터가 열려 있지 않아요." };

  if (request.mode === "regenerate") {
    const block = bridge.getTemplateBlock(request.uid);
    if (!block) return { error: "다시 생성할 블록을 찾지 못했어요." };
    const template = templates.find((t) => t.id === block.attrs.templateId);
    if (!template) return { error: `‘${block.attrs.templateId}’ 템플릿이 없어서 다시 생성할 수 없어요. 템플릿을 다시 만들거나 블록을 일반 블록으로 풀어 주세요.` };
    return { template, inputs: { ...defaultInputs(template), ...block.attrs.inputs }, extra: block.attrs.extra, scope: block.attrs.scope, web: block.attrs.web };
  }

  const template = templates.find((t) => t.id === request.templateId);
  if (!template) return { error: "템플릿을 찾지 못했어요." };
  const inputs = defaultInputs(template);
  // 글을 선택하고 템플릿을 불렀다면 선택한 글이 첫 글자 입력칸의 기본값이다.
  const selected = bridge.getSelectionText().slice(0, MAX_PREFILL);
  const first = template.fields.find((f) => f.type === "text" || f.type === "textarea");
  if (selected && first) inputs[first.key] = selected;
  return { template, inputs, extra: "", scope: template.context, web: template.web && !template.referencesOnly };
}

/** 템플릿 입력 → 생성(웹 검색 가능) → 미리보기 → 글에 삽입. 이미 있는 블록이면 같은 입력값으로 다시 생성한다. */
export function TemplateRunDialog({ request }: { request: RunRequest }) {
  const templates = useTemplateStore((s) => s.templates);
  const close = useTemplateDialogStore((s) => s.close);
  const run = useTemplateRun();
  const referenceCount = useReferenceStore((s) => s.paths.length + (s.includeLinked ? 1 : 0));

  const initial = useMemo(() => resolveInitial(request, templates), [request, templates]);
  const template = "template" in initial ? initial.template : null;

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState("");
  const [scope, setScope] = useState<ContextScope>("section");
  const [web, setWeb] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const seeded = useRef<string | null>(null);

  // 처음 한 번만 채운다 (템플릿 목록이 다시 읽혀도 입력 중인 값을 덮어쓰지 않는다).
  useEffect(() => {
    if (!("template" in initial)) return;
    const key = JSON.stringify(request) + initial.template.id;
    if (seeded.current === key) return;
    seeded.current = key;
    setInputs(initial.inputs);
    setExtra(initial.extra);
    setScope(initial.scope);
    setWeb(initial.web);
    setSubmitted(false);
    useTemplateRun.getState().reset();
  }, [initial, request]);

  useEffect(() => () => void useTemplateRun.getState().cancel().then(() => useTemplateRun.getState().reset()), []);

  const errors = template ? validateInputs(template, inputs) : {};
  const running = run.phase === "running";

  const generate = () => {
    if (!template) return;
    setSubmitted(true);
    if (Object.keys(validateInputs(template, inputs)).length > 0) return;
    void run.start({ template, inputs, extra, scope, web });
  };

  const insert = () => {
    const bridge = useEditorBridge.getState().bridge;
    if (!template || !bridge || run.phase !== "done") return;
    const attrs: TemplateBlockAttrs = { templateId: template.id, style: template.style, title: blockTitle(template), inputs, extra, web: web && !template.referencesOnly, scope };
    if (request.mode === "regenerate") bridge.replaceTemplateBlock(request.uid, attrs, run.output);
    else bridge.insertTemplateBlock(attrs, run.output);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (run.phase === "done") insert();
      else if (!running) generate();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[8vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={template ? `${template.name} 템플릿` : "템플릿"}
        className="w-full max-w-xl space-y-4 rounded-xl border bg-card px-8 py-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {!template ? (
          <>
            <p role="alert" className="text-sm">{"error" in initial ? initial.error : ""}</p>
            <Button size="sm" variant="outline" onClick={close}>닫기</Button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">
                  {template.name} {request.mode === "regenerate" && <span className="text-sm font-normal text-muted-foreground">다시 생성</span>}
                </h2>
                {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
              </div>
              <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            {template.fields.map((field, index) => {
              const error = submitted ? errors[field.key] : undefined;
              const id = `tpl-${field.key}`;
              return (
                <div key={field.key} className="space-y-1">
                  <label htmlFor={id} id={`${id}-label`} className="text-sm font-medium">
                    {field.label} {field.required && <span className="text-destructive" aria-label="필수">*</span>}
                  </label>
                  {field.type === "select" ? (
                    <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
                      {field.options.map((option) => {
                        const on = (inputs[field.key] ?? "") === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setInputs({ ...inputs, [field.key]: option })}
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent",
                              on && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                            )}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  ) : field.type === "textarea" ? (
                    <textarea id={id} rows={3} autoFocus={index === 0} value={inputs[field.key] ?? ""} placeholder={field.placeholder} aria-invalid={Boolean(error)} onChange={(e) => setInputs({ ...inputs, [field.key]: e.target.value })} className={`${fieldClass} resize-y`} />
                  ) : (
                    <input id={id} autoFocus={index === 0} value={inputs[field.key] ?? ""} placeholder={field.placeholder} aria-invalid={Boolean(error)} onChange={(e) => setInputs({ ...inputs, [field.key]: e.target.value })} className={fieldClass} />
                  )}
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
              );
            })}

            <div className="space-y-1">
              <label htmlFor="tpl-extra" className="text-sm font-medium">추가 요청 <span className="font-normal text-muted-foreground">(선택)</span></label>
              <textarea id="tpl-extra" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="예: 예시를 하나 넣어 주세요" className={`${fieldClass} resize-none`} />
            </div>

            <div className="grid grid-cols-2 items-end gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">참고할 본문</span>
                <select aria-label="참고할 본문" value={scope} onChange={(e) => setScope(e.target.value as ContextScope)} className={fieldClass}>
                  {CONTEXT_SCOPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={web && !template.referencesOnly} disabled={template.referencesOnly} onChange={(e) => setWeb(e.target.checked)} />
                <Globe className="size-4" /> 웹 검색 사용
              </label>
            </div>
            {template.referencesOnly && <p className="text-xs text-muted-foreground">이 템플릿은 본문과 참고 글에 있는 내용만 써요 (웹 검색 안 함).</p>}
            {referenceCount > 0 && <p className="text-xs text-muted-foreground">AI 탭에서 고른 참고 글도 함께 보내요.</p>}

            {run.phase !== "idle" && (
              <section aria-label="생성 결과" className="space-y-2">
                {run.phase === "error" ? (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm whitespace-pre-wrap">{run.error}</p>
                ) : (
                  <>
                    <div className="max-h-72 overflow-y-auto rounded-md border bg-background p-3">
                      <p aria-label="생성된 내용" className="text-sm leading-7 break-words whitespace-pre-wrap">{run.output || "…"}</p>
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                      {running && <Loader2 className="size-3.5 animate-spin" />}
                      {running ? run.status || "생성 중…" : "AI가 쓴 내용이에요. 사실은 직접 확인해 주세요."}
                    </p>
                  </>
                )}
              </section>
            )}

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Ctrl/Cmd+Enter로 {run.phase === "done" ? "삽입" : "생성"}</span>
              <div className="flex gap-2">
                {running ? (
                  <Button size="sm" variant="outline" onClick={() => void run.cancel()}>
                    <Square /> 중지
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={generate}>
                      {run.phase === "done" || run.phase === "error" ? <RefreshCw /> : null}
                      {run.phase === "idle" ? "생성" : "다시 생성"}
                    </Button>
                    {run.phase === "done" && (
                      <Button size="sm" onClick={insert}>
                        <Check /> {request.mode === "regenerate" ? "교체" : "삽입"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
