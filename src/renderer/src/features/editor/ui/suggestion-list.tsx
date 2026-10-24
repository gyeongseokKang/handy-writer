import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { Search } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { SuggestionItem } from "../lib/suggestion-render";

export interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** 키보드로 이동할 때 한 번에 더 보여줄 항목 수 */
const PAGE_ITEMS = 5;

/**
 * 선택한 항목이 보이는 영역 밖이면, 그 방향으로 PAGE_ITEMS개 만큼 더 보이도록 스크롤할 위치를 돌려준다.
 * 이미 보이면 null.
 */
export function pagedScrollTop(view: { top: number; height: number; max: number }, item: { top: number; height: number }): number | null {
  const lookahead = (PAGE_ITEMS - 1) * item.height;
  if (item.top + item.height > view.top + view.height) {
    return Math.min(view.max, item.top + item.height + lookahead - view.height);
  }
  if (item.top < view.top) return Math.max(0, item.top - lookahead);
  return null;
}

export function SuggestionList<T>({
  items,
  command,
  query,
  ref,
}: SuggestionProps<SuggestionItem<T>, SuggestionItem<T>> & { ref?: Ref<SuggestionListHandle> }) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const byKeyboard = useRef(false);

  useEffect(() => setSelected(0), [items]);

  // 키보드로 옮겼을 때만 스크롤을 따라간다(마우스로 가리킨 항목은 이미 보이는 곳이다).
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelectorAll<HTMLElement>('[role="option"]')[selected];
    if (!list || !item || !byKeyboard.current) return;
    byKeyboard.current = false;
    const top = pagedScrollTop(
      { top: list.scrollTop, height: list.clientHeight, max: list.scrollHeight - list.clientHeight },
      { top: item.offsetTop, height: item.offsetHeight },
    );
    if (top !== null) list.scrollTop = top;
  }, [selected]);

  const select = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      const move = (next: number) => {
        byKeyboard.current = true;
        setSelected(next);
      };
      if (event.key === "ArrowUp") {
        move((selected + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        move((selected + 1) % items.length);
        return true;
      }
      if (event.key === "PageDown") {
        move(Math.min(items.length - 1, selected + PAGE_ITEMS));
        return true;
      }
      if (event.key === "PageUp") {
        move(Math.max(0, selected - PAGE_ITEMS));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        select(selected);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="w-64 rounded-lg border bg-card p-3 text-sm text-muted-foreground shadow-lg">
        일치하는 항목이 없어요
      </div>
    );
  }

  return (
    <div className="w-64 overflow-hidden rounded-lg border bg-card shadow-lg">
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <Search className="size-3.5 shrink-0" />
        <span className="truncate">{query ? query : "입력해서 찾기"}</span>
        <span className="ml-auto shrink-0">{items.length}개</span>
      </div>
      <div ref={listRef} className="relative max-h-72 overflow-y-auto p-1" role="listbox">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            // 에디터 선택이 풀리지 않게 mousedown에서 포커스 이동을 막는다.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select(index)}
            onMouseEnter={() => setSelected(index)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              index === selected && "bg-accent text-accent-foreground",
            )}
          >
            {item.icon && <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">{item.icon}</span>}
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{item.title}</span>
              {item.description && <span className="truncate text-xs text-muted-foreground">{item.description}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
