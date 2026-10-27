import { issueKey, SPELL_CONTEXT, type SpellItem } from "@shared/spellcheck";
import { Check, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorBridge, type SpellRange } from "@/entities/note/model/use-editor-bridge";
import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const sameRange = (a: SpellRange | null, b: SpellRange) => a?.from === b.from && a.to === b.to;

/**
 * 오른쪽 패널의 "맞춤법" 탭. 이 글의 맞춤법 항목을 모두 보여주고, 하나씩 고치거나 건너뛴다.
 * 항목을 고르면 그 낱말을 강조하고 그 위치로 스크롤한다. 고치거나 건너뛰면 다음 항목으로 넘어간다.
 */
export function SpellPanel() {
  const items = useSpellStore((s) => s.items);
  const enabled = useSpellStore((s) => s.enabled);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [current, setCurrent] = useState<SpellRange | null>(null);
  /** 고치거나 건너뛴 항목의 순서. 목록이 새로 오면 같은 순서의 다음 항목을 고른다. */
  const follow = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const reveal = (item: SpellItem | undefined) => {
    const range = item ? { from: item.from, to: item.to } : null;
    setCurrent(range);
    useEditorBridge.getState().bridge?.revealSpell(range);
  };

  useEffect(() => {
    if (follow.current === null) return;
    const index = Math.min(follow.current, items.length - 1);
    follow.current = null;
    reveal(items[index]);
  }, [items]);

  // 고른 항목이 목록에서도 보이게
  useEffect(() => {
    listRef.current?.querySelector("[aria-current='true']")?.scrollIntoView({ block: "nearest" });
  }, [current]);

  // 탭을 떠나면 강조를 지운다.
  useEffect(() => () => useEditorBridge.getState().bridge?.revealSpell(null), []);

  if (!activePath) return <p className="p-4 text-sm text-muted-foreground">글을 선택하면 맞춤법 항목이 보여요.</p>;
  if (!enabled) {
    return (
      <div className="space-y-3 p-4 text-sm text-muted-foreground">
        <p>맞춤법 표시가 꺼져 있어요.</p>
        <Button size="sm" variant="outline" onClick={() => useSpellStore.getState().setEnabled(true)}>
          맞춤법 표시 켜기
        </Button>
      </div>
    );
  }

  const act = (index: number, run: () => void) => {
    follow.current = index;
    run();
  };
  const fix = (index: number, item: SpellItem, replacement = item.issue.replacement) =>
    act(index, () => {
      if (!useEditorBridge.getState().bridge?.applySpell(item, item.issue.text, replacement)) follow.current = null;
    });
  const skip = (index: number, item: SpellItem) => act(index, () => useEditorBridge.getState().bridge?.skipSpell(item));
  const ignore = (index: number, item: SpellItem) => act(index, () => useSpellStore.getState().ignore(issueKey(item.issue)));

  return (
    <section aria-label="맞춤법 목록" className="flex flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="flex items-center justify-between text-sm font-semibold">
          이 글의 맞춤법
          <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {items.length > 0 ? "항목을 누르면 글에서 그 자리로 이동해요. 고치거나 건너뛰면 다음 항목으로 넘어가요." : "고칠 곳이 없어요."}
        </p>
      </div>
      <ol ref={listRef} className="divide-y">
        {items.map((item, index) => {
          const active = sameRange(current, item);
          const others = item.issue.suggestions?.slice(1, 4) ?? [];
          return (
            <li key={`${item.from}-${item.to}`} aria-current={active} className={cn("px-4 py-2.5", active && "bg-accent/60")}>
              <button type="button" className="block w-full text-left" aria-label={`${item.issue.text} → ${item.issue.replacement}`} onClick={() => reveal(item)}>
                <p className="text-sm">
                  <span className="text-muted-foreground line-through decoration-red-500/70">{item.issue.text}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-semibold">{item.issue.replacement}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.before.length >= SPELL_CONTEXT && "…"}
                  {item.before.trimStart()}
                  <mark className="rounded-sm bg-red-500/15 px-0.5 text-foreground">{item.issue.text}</mark>
                  {item.after.trimEnd()}
                  {item.after.length >= SPELL_CONTEXT && "…"}
                </p>
              </button>
              {active && (
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-xs text-muted-foreground">{item.issue.hint}</p>
                  {others.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="다른 제안">
                      {others.map((suggestion) => (
                        <Button key={suggestion} size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => fix(index, item, suggestion)}>
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-1.5 flex items-center gap-1.5">
                <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => fix(index, item)}>
                  <Check className="size-3.5" />
                  고치기
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => skip(index, item)}>
                  <SkipForward className="size-3.5" />
                  건너뛰기
                </Button>
                <button
                  type="button"
                  title="같은 낱말을 앞으로 모든 글에서 표시하지 않아요"
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => ignore(index, item)}
                >
                  항상 무시
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
