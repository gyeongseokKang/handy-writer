import {
  BLOCK_STYLES,
  CONTEXT_SCOPES,
  isValidFieldKey,
  unknownPlaceholders,
  type BlockStyle,
  type ContextScope,
  type FieldType,
  type Template,
  type TemplateField,
} from "@shared/templates";
import { Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useTemplateDialogStore } from "@/entities/template/model/use-template-dialog-store";
import { useTemplateStore } from "@/entities/template/model/use-template-store";
import { Button } from "@/shared/ui/button";

const fieldClass =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

const NEW_TEMPLATE: Template = {
  id: "",
  name: "",
  description: "",
  style: "note",
  title: "",
  context: "section",
  web: false,
  referencesOnly: false,
  fields: [],
  prompt: "",
};

const FIELD_TYPE_LABEL: Record<FieldType, string> = { text: "한 줄", textarea: "여러 줄", select: "선택" };

/** 필드 입력 줄이 바뀔 때마다 쓰는 오류 확인 (키 형식과 중복) */
function fieldErrors(fields: TemplateField[]) {
  const seen = new Set<string>();
  return fields.map((field) => {
    if (!isValidFieldKey(field.key)) return "키는 글자, 숫자, _만 쓸 수 있고 숫자로 시작할 수 없어요.";
    if (seen.has(field.key)) return "다른 필드와 키가 같아요.";
    seen.add(field.key);
    if (field.type === "select" && field.options.length === 0) return "선택지를 쉼표로 구분해 입력해 주세요.";
    return "";
  });
}

/** 템플릿을 만들고 고친다. 파일(.handy-writer/templates/*.md)로 저장되어 git으로 함께 관리된다. */
export function TemplateEditorDialog({ templateId }: { templateId: string | null }) {
  const close = useTemplateDialogStore((s) => s.close);
  const templates = useTemplateStore((s) => s.templates);
  const save = useTemplateStore((s) => s.save);
  const remove = useTemplateStore((s) => s.remove);

  const original = templateId ? templates.find((t) => t.id === templateId) : undefined;
  const [draft, setDraft] = useState<Template>(() => original ?? NEW_TEMPLATE);
  const [optionsText, setOptionsText] = useState<Record<number, string>>(() =>
    Object.fromEntries((original?.fields ?? []).map((f, i) => [i, f.options.join(", ")])),
  );
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => fieldErrors(draft.fields), [draft.fields]);
  const unknown = useMemo(() => unknownPlaceholders(draft), [draft]);
  const invalid = !draft.name.trim() || !draft.prompt.trim() || errors.some(Boolean);

  const patch = (changes: Partial<Template>) => setDraft((d) => ({ ...d, ...changes }));
  const patchField = (index: number, changes: Partial<TemplateField>) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f, i) => (i === index ? { ...f, ...changes } : f)) }));

  const addField = () => {
    let n = draft.fields.length + 1;
    while (draft.fields.some((f) => f.key === `field${n}`)) n++;
    setDraft((d) => ({ ...d, fields: [...d.fields, { key: `field${n}`, label: `입력 ${n}`, type: "text", required: false, placeholder: "", options: [], default: "" }] }));
  };

  const onSave = async () => {
    setSaving(true);
    const saved = await save({ ...draft, name: draft.name.trim() });
    setSaving(false);
    if (saved) {
      toast.success("템플릿을 저장했어요.");
      close();
    }
  };

  const onDelete = async () => {
    if (!draft.id) return;
    const message = original?.builtin ? "기본 템플릿으로 되돌릴까요? 고친 내용은 사라져요." : `“${draft.name}” 템플릿을 삭제할까요?`;
    if (window.confirm(message) && (await remove(draft.id))) {
      toast.success(original?.builtin ? "기본값으로 되돌렸어요." : "템플릿을 삭제했어요.");
      close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[5vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="템플릿 편집"
        className="w-full max-w-2xl space-y-4 rounded-xl border bg-card p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && !event.nativeEvent.isComposing && close()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{original ? `${original.name} 편집` : "새 템플릿"}</h2>
          <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">이름 *</span>
            <input aria-label="템플릿 이름" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="예: 더 알아보기" className={fieldClass} autoFocus />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">블록 제목</span>
            <input aria-label="블록 제목" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder={draft.name || "비우면 이름"} className={fieldClass} />
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-sm font-medium">설명</span>
            <input aria-label="템플릿 설명" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="슬래시 메뉴에 보여요" className={fieldClass} />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">블록 모양</span>
            <select aria-label="블록 모양" value={draft.style} onChange={(e) => patch({ style: e.target.value as BlockStyle })} className={fieldClass}>
              {BLOCK_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">기본으로 참고할 본문</span>
            <select aria-label="참고할 본문 범위" value={draft.context} onChange={(e) => patch({ context: e.target.value as ContextScope })} className={fieldClass}>
              {CONTEXT_SCOPES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.web && !draft.referencesOnly} disabled={draft.referencesOnly} onChange={(e) => patch({ web: e.target.checked })} />
            웹 검색을 기본으로 사용
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.referencesOnly} onChange={(e) => patch({ referencesOnly: e.target.checked, web: e.target.checked ? false : draft.web })} />
            본문과 참고 글에 있는 내용만 쓰기
          </label>
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">입력 필드 <span className="font-normal text-muted-foreground">(사용할 때 채워요)</span></h3>
            <Button size="sm" variant="outline" onClick={addField}>
              <Plus /> 필드 추가
            </Button>
          </div>
          {draft.fields.length === 0 && <p className="text-sm text-muted-foreground">필드가 없으면 입력 없이 바로 생성해요.</p>}
          {draft.fields.map((field, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3" data-field-row>
              <div className="grid grid-cols-[1fr_1fr_6.5rem_auto] items-end gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">키 ({"{{키}}"})</span>
                  <input aria-label="필드 키" value={field.key} aria-invalid={Boolean(errors[index])} onChange={(e) => patchField(index, { key: e.target.value.trim() })} className={fieldClass} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">표시 이름</span>
                  <input aria-label="필드 이름" value={field.label} onChange={(e) => patchField(index, { label: e.target.value })} className={fieldClass} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">종류</span>
                  <select aria-label="필드 종류" value={field.type} onChange={(e) => patchField(index, { type: e.target.value as FieldType })} className={fieldClass}>
                    {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((type) => (
                      <option key={type} value={type}>{FIELD_TYPE_LABEL[type]}</option>
                    ))}
                  </select>
                </label>
                <button type="button" aria-label="필드 삭제" onClick={() => setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }))} className="mb-1 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">안내 문구</span>
                  <input aria-label="필드 안내" value={field.placeholder} onChange={(e) => patchField(index, { placeholder: e.target.value })} className={fieldClass} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">기본값</span>
                  <input aria-label="필드 기본값" value={field.default} onChange={(e) => patchField(index, { default: e.target.value })} className={fieldClass} />
                </label>
              </div>
              {field.type === "select" && (
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">선택지 (쉼표로 구분)</span>
                  <input
                    aria-label="필드 선택지"
                    value={optionsText[index] ?? field.options.join(", ")}
                    onChange={(e) => {
                      setOptionsText({ ...optionsText, [index]: e.target.value });
                      patchField(index, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) });
                    }}
                    placeholder="약 200자, 약 400자, 약 800자"
                    className={fieldClass}
                  />
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={field.required} onChange={(e) => patchField(index, { required: e.target.checked })} />
                필수 (비워 두면 AI가 본문에서 알맞게 정해요)
              </label>
              {errors[index] && <p className="text-xs text-destructive">{errors[index]}</p>}
            </div>
          ))}
        </section>

        <label className="block space-y-1">
          <span className="text-sm font-medium">사전 프롬프트 *</span>
          <textarea
            aria-label="사전 프롬프트"
            rows={7}
            value={draft.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="AI에게 줄 지침이에요. 입력 필드는 {{키}}로 넣어요."
            className={`${fieldClass} resize-y`}
          />
          {draft.fields.length > 0 && (
            <span className="flex flex-wrap gap-1.5 pt-1 text-xs text-muted-foreground">
              넣을 수 있는 값:
              {draft.fields.map((f) => (
                <code key={f.key} className="rounded bg-muted px-1">{`{{${f.key}}}`}</code>
              ))}
            </span>
          )}
          {unknown.length > 0 && <span className="block text-xs text-destructive">정의되지 않은 값이 있어요 (비워서 보내져요): {unknown.map((k) => `{{${k}}}`).join(", ")}</span>}
        </label>

        <div className="flex items-center justify-between border-t pt-3">
          <div>
            {draft.id && (!original?.builtin || original.customized) && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void onDelete()}>
                {original?.builtin ? "기본값으로 되돌리기" : "삭제"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={close}>취소</Button>
            <Button size="sm" disabled={invalid || saving} onClick={() => void onSave()}>저장</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
