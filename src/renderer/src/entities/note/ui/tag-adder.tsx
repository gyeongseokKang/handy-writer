import { Hash, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import type { TagSuggestion } from "@shared/tag-suggest";

/**
 * 태그 추가. 열면 이 글에 어울리는 태그를 작업 폴더의 기존 태그에서 자동으로 골라 보여주고(새 태그 후보 몇 개 포함),
 * 누르면 frontmatter의 tags에 더한다. 직접 입력할 수도 있다 (기존 태그 자동완성).
 */
interface TagAdderProps {
  path: string;
  currentTags: string[];
  /** 추천에 쓸 지금 본문 (저장 전 내용 포함) */
  getText: () => string;
  /** 고른 태그를 글에 더한다 (frontmatter의 tags) */
  onAdd: (tags: string[]) => void;
  /** 접힌 버튼의 모양: chip(목록 사이), subtle(제목 아래처럼 눈에 덜 띄게) */
  variant?: "chip" | "subtle";
}

export function TagAdder({ path, currentTags, getText, onAdd, variant = "chip" }: TagAdderProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<TagSuggestion[] | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const getTextRef = useRef(getText);
  getTextRef.current = getText;
  const entries = useNoteIndexStore((s) => s.entries);
  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, "ko")), [entries]);

  // 다른 글로 옮겨 가면 닫는다.
  useEffect(() => {
    setOpen(false);
    setSuggestions(null);
    setAdded([]);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSuggestions(null);
    const text = getTextRef.current();
    api.tags
      .suggest(path, text)
      .then((result) => !cancelled && setSuggestions(result))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  const have = new Set([...currentTags, ...added].map((t) => t.toLowerCase()));
  const add = (tags: string[]) => {
    const fresh = tags.map((t) => t.trim().replace(/^#/, "")).filter((t) => t && !have.has(t.toLowerCase()));
    if (fresh.length === 0) return;
    onAdd(fresh);
    setAdded((prev) => [...prev, ...fresh]);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
          variant === "chip" ? "border border-dashed" : "opacity-70 hover:opacity-100",
        )}
      >
        <Plus className="size-3" /> 태그
      </button>
    );
  }

  const visible = (suggestions ?? []).filter((s) => !have.has(s.tag.toLowerCase()));

  return (
    <div role="group" aria-label="태그 추가" className="mt-2 w-full space-y-2 rounded-lg border bg-background p-2">
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          add(input.split(/[,\s]+/));
          setInput("");
        }}
      >
        <Hash className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          aria-label="새 태그"
          list="tag-adder-options"
          value={input}
          placeholder="태그 입력 후 Enter"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <datalist id="tag-adder-options">
          {allTags.filter((t) => !have.has(t.toLowerCase())).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="button" aria-label="태그 추가 닫기" onClick={() => setOpen(false)} className="rounded p-0.5 text-muted-foreground hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </form>
      <div className="space-y-1">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles className="size-3" /> 이 글에 어울리는 태그
        </p>
        {suggestions === null ? (
          <p role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> 기존 태그에서 고르는 중…
          </p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground">추천할 태그가 없어요. 직접 입력해 주세요.</p>
        ) : (
          <div aria-label="추천 태그" className="flex flex-wrap gap-1.5">
            {visible.map((s) => (
              <button
                key={s.tag}
                type="button"
                title={s.reason}
                aria-label={`${s.tag} 태그 추가 (${s.reason})`}
                onClick={() => add([s.tag])}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs hover:bg-primary hover:text-primary-foreground",
                  s.kind === "new" ? "border border-dashed text-muted-foreground" : "bg-accent",
                )}
              >
                <Plus className="size-3" />
                {s.tag}
                {s.kind === "new" && <span className="ml-0.5 text-[10px] opacity-70">새</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
