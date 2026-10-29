import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";

const ACTIONS: Array<{ label: string; run: (e: Editor) => void; danger?: boolean }> = [
  { label: "위에 행", run: (e) => e.chain().focus().addRowBefore().run() },
  { label: "아래에 행", run: (e) => e.chain().focus().addRowAfter().run() },
  { label: "왼쪽에 열", run: (e) => e.chain().focus().addColumnBefore().run() },
  { label: "오른쪽에 열", run: (e) => e.chain().focus().addColumnAfter().run() },
  { label: "행 삭제", run: (e) => e.chain().focus().deleteRow().run(), danger: true },
  { label: "열 삭제", run: (e) => e.chain().focus().deleteColumn().run(), danger: true },
  { label: "머리글 행", run: (e) => e.chain().focus().toggleHeaderRow().run() },
  { label: "표 삭제", run: (e) => e.chain().focus().deleteTable().run(), danger: true },
];

/** 커서가 표 안에 있고 글을 선택하지 않았을 때 표 위에 뜨는 행·열 편집 막대 */
export function TableMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor: e }) => e.isEditable && e.isActive("table") && e.state.selection.empty}
      getReferencedVirtualElement={() => {
        const node = editor.view.domAtPos(editor.state.selection.from).node;
        const table = (node instanceof Element ? node : node.parentElement)?.closest("table");
        return table ? { getBoundingClientRect: () => table.getBoundingClientRect(), contextElement: table } : null;
      }}
      options={{ placement: "top-start", offset: 8 }}
    >
      <div role="toolbar" aria-label="표 편집" className="flex items-center gap-0.5 rounded-lg border bg-card p-1 text-xs shadow-lg">
        {ACTIONS.map(({ label, run, danger }) => (
          <button
            key={label}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(editor)}
            className={`rounded-md px-2 py-1 whitespace-nowrap hover:bg-accent ${danger ? "text-destructive" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
