import { Globe, LayoutTemplate, Pencil, Plus } from "lucide-react";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useTemplateDialogStore } from "@/entities/template/model/use-template-dialog-store";
import { useTemplateStore } from "@/entities/template/model/use-template-store";
import { Button } from "@/shared/ui/button";

/** AI 탭 아래의 "템플릿 블록" 목록. 쓰거나 고치거나 새로 만든다. */
export function TemplateList() {
  const templates = useTemplateStore((s) => s.templates);
  const bridge = useEditorBridge((s) => s.bridge);
  const { openNew, openEdit } = useTemplateDialogStore.getState();

  return (
    <section aria-label="템플릿 블록" className="space-y-2 border-t px-4 py-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <LayoutTemplate className="size-3.5" /> 템플릿 블록
        </h2>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(null)}>
          <Plus /> 새 템플릿
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">글에서 /를 누르면 템플릿 이름으로 바로 쓸 수 있어요.</p>
      <ul aria-label="템플릿 목록" className="space-y-1">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2" data-template-id={template.id}>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{template.name}</span>
                {template.web && !template.referencesOnly && <Globe className="size-3 shrink-0 text-muted-foreground" aria-label="웹 검색" />}
                {template.customized && <span className="shrink-0 rounded bg-accent px-1 text-[10px] font-normal">수정됨</span>}
              </span>
              {template.description && <span className="block truncate text-xs text-muted-foreground">{template.description}</span>}
            </span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!bridge} aria-label={`${template.name} 사용`} onClick={() => openNew(template.id)}>
              사용
            </Button>
            <button type="button" aria-label={`${template.name} 편집`} title="편집" onClick={() => openEdit(template.id)} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
              <Pencil className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
