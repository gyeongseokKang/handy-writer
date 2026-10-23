import { useTemplateDialogStore } from "@/entities/template/model/use-template-dialog-store";

import { TemplateEditorDialog } from "./template-editor-dialog";
import { TemplateRunDialog } from "./template-run-dialog";

/** 템플릿 관련 창 (실행, 편집)을 한 곳에서 띄운다. */
export function TemplateDialogs() {
  const request = useTemplateDialogStore((s) => s.request);
  if (!request) return null;
  if (request.mode === "edit") return <TemplateEditorDialog key={request.templateId ?? "new"} templateId={request.templateId} />;
  return <TemplateRunDialog key={request.mode === "new" ? request.templateId : request.uid} request={request} />;
}
