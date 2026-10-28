import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/utils";

import { clearFind, getFindState, replaceAll, replaceCurrent, setFind, stepFind } from "../lib/find-replace";

interface FindBarProps {
  editor: Editor;
  onClose: () => void;
}

/** 글 안에서 찾고 바꾸는 막대. 에디터 오른쪽 위에 떠 있다. */
export function FindBar({ editor, onClose }: FindBarProps) {
  const [query, setQuery] = useState(() => {
    const { from, to, empty } = editor.state.selection;
    const picked = empty ? "" : editor.state.doc.textBetween(from, to, " ");
    return picked.includes("\n") || picked.length > 80 ? "" : picked;
  });
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useEditorState({ editor, selector: ({ editor: e }) => getFindState(e) });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setFind(editor, query);
  }, [editor, query]);

  useEffect(() => () => {
    if (!editor.isDestroyed) clearFind(editor);
  }, [editor]);

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  // 버튼이 비활성화되며 포커스를 잃어도 Esc로 닫을 수 있게 창에서 받는다.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.target === inputRef.current) stepFind(editor, event.shiftKey ? -1 : 1);
      else replaceCurrent(editor, replacement);
    }
  };

  const count = query ? (state.matches.length === 0 ? "결과 없음" : `${state.current + 1} / ${state.matches.length}`) : "";
  const noMatch = query !== "" && state.matches.length === 0;
  const iconButton = "flex size-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      role="search"
      aria-label="글 안에서 찾기"
      onKeyDown={onKeyDown}
      className="absolute top-3 right-6 z-30 w-80 space-y-1.5 rounded-lg border bg-card p-2 text-sm text-card-foreground shadow-lg"
    >
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="찾을 말"
          aria-label="찾을 말"
          className={cn("min-w-0 flex-1 rounded-md border bg-background px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", noMatch && "border-destructive")}
        />
        <span className="w-16 shrink-0 text-center text-xs text-muted-foreground" aria-live="polite">
          {count}
        </span>
        <button type="button" aria-label="이전 결과" title="이전 (Shift+Enter)" disabled={state.matches.length === 0} onClick={() => stepFind(editor, -1)} className={iconButton}>
          <ChevronUp className="size-4" />
        </button>
        <button type="button" aria-label="다음 결과" title="다음 (Enter)" disabled={state.matches.length === 0} onClick={() => stepFind(editor, 1)} className={iconButton}>
          <ChevronDown className="size-4" />
        </button>
        <button type="button" aria-label="찾기 닫기" title="닫기 (Esc)" onClick={close} className={iconButton}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={state.caseSensitive} onChange={(event) => setFind(editor, query, event.target.checked)} />
          대소문자 구분
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showReplace} onChange={(event) => setShowReplace(event.target.checked)} />
          바꾸기
        </label>
      </div>
      {showReplace && (
        <div className="flex items-center gap-1">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="바꿀 말"
            aria-label="바꿀 말"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="button" disabled={state.matches.length === 0} onClick={() => replaceCurrent(editor, replacement)} className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-40">
            바꾸기
          </button>
          <button
            type="button"
            disabled={state.matches.length === 0}
            onClick={() => toast.success(`${replaceAll(editor, replacement)}곳을 바꿨어요.`)}
            className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-40"
          >
            모두 바꾸기
          </button>
        </div>
      )}
    </div>
  );
}
