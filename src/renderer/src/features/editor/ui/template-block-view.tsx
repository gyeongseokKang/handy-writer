import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, Lightbulb, OctagonAlert, Quote, RefreshCw, StickyNote, Trash2, Unlink, type LucideIcon } from "lucide-react";

import { useTemplateDialogStore } from "@/entities/template/model/use-template-dialog-store";
import { cn } from "@/shared/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  tip: Lightbulb,
  info: Info,
  note: StickyNote,
  success: CheckCircle2,
  question: HelpCircle,
  warning: AlertTriangle,
  danger: OctagonAlert,
  quote: Quote,
};

const actionClass = "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground";

/** 템플릿 블록의 화면. 제목줄의 버튼으로 다시 생성하거나, 일반 콜아웃으로 풀거나, 지울 수 있다. */
export function TemplateBlockView({ node, editor, getPos, deleteNode, selected }: ReactNodeViewProps) {
  const { style, title, uid } = node.attrs as { style: string; title: string; uid: string };
  const Icon = ICONS[style] ?? StickyNote;

  /** 입력값 메타데이터를 버리고 일반 콜아웃으로 바꾼다. 내용은 그대로 남는다. */
  const unwrap = () => {
    const pos = getPos();
    if (pos === undefined) return;
    editor
      .chain()
      .command(({ tr, state }) => {
        const current = state.doc.nodeAt(pos);
        const callout = state.schema.nodes["callout"];
        if (!current || !callout) return false;
        tr.replaceWith(pos, pos + current.nodeSize, callout.create({ calloutType: style, title }, current.content));
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper className={cn("template-block", selected && "template-block-selected")} data-style={style} data-template-uid={uid}>
      <div className="template-block-header" contentEditable={false}>
        <Icon className="size-4 shrink-0" />
        <span className="template-block-title">{title}</span>
        <span className="template-block-badge">템플릿</span>
        <span className="flex-1" />
        <button type="button" className={actionClass} title="같은 입력값으로 다시 생성" aria-label="다시 생성" onClick={() => useTemplateDialogStore.getState().openRegenerate(uid)}>
          <RefreshCw className="size-3.5" />
        </button>
        <button type="button" className={actionClass} title="일반 콜아웃으로 풀기 (내용은 그대로)" aria-label="일반 블록으로 풀기" onClick={unwrap}>
          <Unlink className="size-3.5" />
        </button>
        <button type="button" className={actionClass} title="블록 삭제" aria-label="블록 삭제" onClick={() => deleteNode()}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <NodeViewContent className="template-block-body" />
    </NodeViewWrapper>
  );
}
