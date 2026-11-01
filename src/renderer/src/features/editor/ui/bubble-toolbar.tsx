import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Check, ChevronDown, Code, Italic, Strikethrough } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";
import { shortcutLabel } from "@/shared/lib/shortcut";

import { BLOCK_TYPES, blockShortcut, currentBlockType } from "../lib/block-types";

const MARKS = [
  { name: "bold", label: "굵게", icon: Bold, toggle: (e: Editor) => e.chain().focus().toggleBold().run() },
  { name: "italic", label: "기울임", icon: Italic, toggle: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { name: "strike", label: "취소선", icon: Strikethrough, toggle: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { name: "code", label: "코드", icon: Code, toggle: (e: Editor) => e.chain().focus().toggleCode().run() },
] as const;

function BlockTypeMenu({ editor }: { editor: Editor }) {
  const label = useEditorState({ editor, selector: ({ editor: e }) => currentBlockType(e).label });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="블록 종류"
        aria-haspopup="menu"
        aria-expanded={open}
        title="이 블록의 종류 바꾸기 (본문, 제목, 목록, 인용…)"
        // 눌러도 에디터의 선택이 풀리지 않게 한다.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={cn("flex h-8 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap hover:bg-accent", open && "bg-accent")}
      >
        {label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div role="menu" aria-label="블록 종류" className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border bg-card p-1 text-sm shadow-lg">
          {BLOCK_TYPES.map((type) => {
            const current = type.label === label;
            return (
              <button
                key={type.id}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  type.set(editor);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className="flex size-4 items-center justify-center">{current && <Check className="size-3.5" />}</span>
                <span className="flex-1">{type.label}</span>
                <kbd className="font-sans text-[10px] text-muted-foreground">{shortcutLabel(blockShortcut(type))}</kbd>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => Object.fromEntries(MARKS.map((mark) => [mark.name, e.isActive(mark.name)])),
  });

  return (
    <BubbleMenu editor={editor} options={{ placement: "top" }}>
      <div className="flex items-center gap-0.5 rounded-lg border bg-card p-1 shadow-lg">
        <BlockTypeMenu editor={editor} />
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
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
