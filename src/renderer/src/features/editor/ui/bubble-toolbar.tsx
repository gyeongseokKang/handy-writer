import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, Strikethrough } from "lucide-react";

import { cn } from "@/shared/lib/utils";

const MARKS = [
  { name: "bold", label: "굵게", icon: Bold, toggle: (e: Editor) => e.chain().focus().toggleBold().run() },
  { name: "italic", label: "기울임", icon: Italic, toggle: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { name: "strike", label: "취소선", icon: Strikethrough, toggle: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { name: "code", label: "코드", icon: Code, toggle: (e: Editor) => e.chain().focus().toggleCode().run() },
] as const;

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => Object.fromEntries(MARKS.map((mark) => [mark.name, e.isActive(mark.name)])),
  });

  return (
    <BubbleMenu editor={editor} options={{ placement: "top" }}>
      <div className="flex items-center gap-0.5 rounded-lg border bg-card p-1 shadow-lg">
        {MARKS.map(({ name, label, icon: Icon, toggle }) => (
          <button
            key={name}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active[name]}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggle(editor)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md hover:bg-accent",
              active[name] && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
