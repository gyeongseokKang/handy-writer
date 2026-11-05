import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Check, ChevronDown, Code, Italic, Strikethrough } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/lib/utils";
import { shortcutLabel } from "@/shared/lib/shortcut";

import { BLOCK_TYPES, blockShortcut, currentBlockType } from "../lib/block-types";

/** shortcut은 tiptap 기본 단축키 */
const MARKS = [
  { name: "bold", label: "굵게", shortcut: "Mod+B", icon: Bold, toggle: (e: Editor) => e.chain().focus().toggleBold().run() },
  { name: "italic", label: "기울임", shortcut: "Mod+I", icon: Italic, toggle: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { name: "strike", label: "취소선", shortcut: "Mod+Shift+S", icon: Strikethrough, toggle: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { name: "code", label: "코드", shortcut: "Mod+E", icon: Code, toggle: (e: Editor) => e.chain().focus().toggleCode().run() },
] as const;

/** 버튼에 올리면 바로 뜨는 이름·단축키 풍선 (title은 늦게 떠서 따로 그린다) */
function Hint({ label, keys }: { label: string; keys: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 hidden -translate-x-1/2 items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-[11px] whitespace-nowrap text-background shadow group-hover/hint:flex"
    >
      {label}
      <kbd className="font-sans opacity-70">{keys}</kbd>
    </span>
  );
}

/** 선택한 채로 Tab: 블록 종류 메뉴를 연다 (목록·코드 블록 안에서는 원래대로 들여쓰기) */
function opensBlockMenu(editor: Editor, event: KeyboardEvent) {
  if (event.key !== "Tab" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return false;
  // 에디터는 브라우저의 선택을 조금 늦게 받아 온다. 막 선택하고 바로 Tab을 눌러도 되게 화면의 선택도 본다.
  const dom = window.getSelection();
  const selected = !editor.state.selection.empty || (!!dom && !dom.isCollapsed && editor.view.dom.contains(dom.anchorNode));
  return selected && !editor.isActive("listItem") && !editor.isActive("taskItem") && !editor.isActive("codeBlock");
}

function BlockTypeMenu({ editor }: { editor: Editor }) {
  const label = useEditorState({ editor, selector: ({ editor: e }) => currentBlockType(e).label });
  const [open, setOpen] = useState(false);
  /** Tab으로 열었으면 메뉴 항목으로 포커스를 옮긴다 */
  const [byKeyboard, setByKeyboard] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!opensBlockMenu(editor, event)) return;
      event.preventDefault();
      event.stopPropagation();
      // 에디터가 아직 화면의 선택을 못 받아 왔으면 먼저 옮겨 둔다 (포커스가 메뉴로 가면 더는 받아 오지 않는다).
      const tr = editor.state.tr;
      const dom = window.getSelection();
      if (editor.state.selection.empty && dom?.anchorNode && dom.focusNode) {
        try {
          const anchor = editor.view.posAtDOM(dom.anchorNode, dom.anchorOffset);
          const head = editor.view.posAtDOM(dom.focusNode, dom.focusOffset);
          tr.setSelection(TextSelection.create(tr.doc, anchor, head));
        } catch {
          // 위치를 못 찾으면 그대로 둔다.
        }
      }
      // 선택 막대는 선택하고 잠깐 뒤에 뜬다. 그 전에 Tab을 눌러도 바로 띄워서 메뉴가 화면에 붙어 있게 한다.
      editor.view.dispatch(tr.setMeta("bubbleMenu", "show"));
      setByKeyboard(true);
      setOpen(true);
    };
    // ProseMirror보다 먼저 받는다.
    dom.addEventListener("keydown", onKeyDown, true);
    return () => dom.removeEventListener("keydown", onKeyDown, true);
  }, [editor]);

  useEffect(() => {
    if (!open || !byKeyboard) return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    (items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0])?.focus();
  }, [open, byKeyboard]);

  const close = (refocus: boolean) => {
    setOpen(false);
    setByKeyboard(false);
    if (refocus) window.requestAnimationFrame(() => editor.commands.focus());
  };
  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = (step: number) => {
      event.preventDefault();
      items[(index + step + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) move(1);
    else if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) move(-1);
    else if (event.key === "Home") move(-index);
    else if (event.key === "End") move(items.length - 1 - index);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  // 바깥을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(true); };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="group/hint relative">
      <button
        type="button"
        aria-label="블록 종류"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-keyshortcuts="Tab"
        // 눌러도 에디터의 선택이 풀리지 않게 한다.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={cn("flex h-8 items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap hover:bg-accent", open && "bg-accent")}
      >
        {label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {!open && <Hint label="블록 종류 바꾸기" keys="Tab" />}
      {open && (
        <div ref={menuRef} role="menu" aria-label="블록 종류" onKeyDown={onMenuKeyDown} className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border bg-card p-1 text-sm shadow-lg">
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
                  // 키보드로 골랐으면 메뉴가 사라진 뒤 에디터로 포커스를 돌려준다.
                  close(byKeyboard);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
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
        {MARKS.map(({ name, label, shortcut, icon: Icon, toggle }) => (
          <span key={name} className="group/hint relative">
          <button
            type="button"
            aria-label={label}
            aria-keyshortcuts={shortcut.replace("Mod", "Control")}
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
          <Hint label={label} keys={shortcutLabel(shortcut)} />
          </span>
        ))}
      </div>
    </BubbleMenu>
  );
}
