import type { MatchRange, SearchResult } from "@shared/search";
import { splitTerms } from "@shared/search";
import { FileText, Folder, Hash, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";

const SEARCH_DELAY_MS = 120;
const RECENT_COUNT = 10;

function Highlighted({ text, ranges }: { text: string; ranges: MatchRange[] }): ReactNode {
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={index} className="rounded-sm bg-yellow-300/60 text-inherit">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** Cmd/Ctrl+K 또는 Cmd/Ctrl+P로 여는 글 검색. 제목, 태그, 본문을 한꺼번에 찾는다. */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const notes = useWorkspaceStore((s) => s.notes);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  /** `results`가 어떤 검색어에 대한 결과인지. 입력 직후 결과가 도착하기 전에는 이전 목록이 남아 있다. */
  const [resultsQuery, setResultsQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    inputRef.current?.focus();
  }, [open]);

  const recent = useMemo(
    () =>
      [...notes]
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, RECENT_COUNT)
        .map<SearchResult>((note) => ({ path: note.path, name: note.name, folder: note.folder, tags: [], score: 0, titleRanges: [], snippets: [] })),
    [notes],
  );

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      requestRef.current++;
      setResults(recent);
      setResultsQuery("");
      setSelected(0);
      return;
    }
    const request = ++requestRef.current;
    const timer = window.setTimeout(() => {
      api.search
        .query(query)
        .then((found) => {
          if (request !== requestRef.current) return; // 더 새로운 검색이 시작됐다
          setResults(found);
          setResultsQuery(query);
          setSelected(0);
        })
        .catch(() => request === requestRef.current && setResults([]));
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, query, recent]);

  if (!open) return null;

  const close = () => setOpen(false);

  const choose = async (result: SearchResult | undefined) => {
    if (!result) return;
    close();
    const term = result.snippets.length > 0 ? (splitTerms(query)[0] ?? "") : "";
    const alreadyOpen = useWorkspaceStore.getState().activePath === result.path;
    if (term && !alreadyOpen) useUiStore.getState().setPendingFind(term);
    await useWorkspaceStore.getState().openNote(result.path);
    if (term && alreadyOpen) useEditorBridge.getState().bridge?.findAndSelect(term);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(results[selected]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="글 검색"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 태그, 본문에서 찾기"
            aria-label="검색어"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>

        <ul role="listbox" aria-label="검색 결과" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              {query.trim() ? (resultsQuery === query ? "일치하는 글이 없어요" : "검색 중…") : "아직 글이 없어요"}
            </li>
          )}
          {results.map((result, index) => (
            <li key={result.path} role="option" aria-selected={index === selected}>
              <button
                type="button"
                onMouseEnter={() => setSelected(index)}
                onClick={() => void choose(result)}
                className={cn("flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left", index === selected && "bg-accent")}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    <Highlighted text={result.name} ranges={result.titleRanges} />
                  </span>
                  {result.folder && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Folder className="size-3" />
                      {result.folder}
                    </span>
                  )}
                  {result.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="flex shrink-0 items-center text-xs font-normal text-muted-foreground">
                      <Hash className="size-3" />
                      {tag}
                    </span>
                  ))}
                </span>
                {result.snippets.map((snippet, i) => (
                  <span key={i} className="line-clamp-2 pl-6 text-xs leading-5 text-muted-foreground">
                    <Highlighted text={snippet.text} ranges={snippet.ranges} />
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>↑↓ 이동</span>
          <span>Enter 열기</span>
          <span>Esc 닫기</span>
          <span className="ml-auto">{!query.trim() ? "최근 글" : resultsQuery === query ? `${results.length}개` : "검색 중…"}</span>
        </div>
      </div>
    </div>
  );
}
