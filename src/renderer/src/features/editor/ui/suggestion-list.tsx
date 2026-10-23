import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useImperativeHandle, useState, type Ref } from "react";

import { cn } from "@/shared/lib/utils";

import type { SuggestionItem } from "../lib/suggestion-render";

export interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export function SuggestionList<T>({
  items,
  command,
  ref,
}: SuggestionProps<SuggestionItem<T>, SuggestionItem<T>> & { ref?: Ref<SuggestionListHandle> }) {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [items]);

  const select = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowUp") {
        setSelected((selected + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((selected + 1) % items.length);
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
    <div className="max-h-80 w-64 overflow-y-auto rounded-lg border bg-card p-1 shadow-lg" role="listbox">
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
  );
}
