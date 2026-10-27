import { ListTree, Sparkles } from "lucide-react";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { useOutlineStore } from "@/entities/note/model/use-outline-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

/**
 * 에디터 왼쪽 위에 떠 있는 목차. 평소에는 지금 보고 있는 제목만 한 줄로 보여주고,
 * 마우스를 올리거나 키보드로 들어오면 전체 목차를 펼친다. 누르면 그 제목으로 옮겨 간다.
 */
export function OutlinePanel() {
  const headings = useOutlineStore((s) => s.headings);
  const activePos = useOutlineStore((s) => s.activePos);
  const setDraftOpen = useUiStore((s) => s.setDraftOpen);

  // 가장 높은 제목 수준을 왼쪽 끝에 맞춘다 (## 부터 쓰는 글도 들여쓰기 없이 시작).
  const top = Math.min(...headings.map((h) => h.level), 6);
  const current = headings.find((h) => h.pos === activePos) ?? headings[0];

  return (
    <nav
      aria-label="목차"
      // 목록이 접혀 있으면 안의 버튼에 갈 수 없으므로, 목차 자체가 포커스를 받아 펼친다.
      tabIndex={0}
      className="group outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 absolute top-4 left-4 z-10 w-max max-w-56 rounded-lg border bg-card/90 text-sm shadow-sm backdrop-blur hover:w-64 hover:max-w-64 focus-within:w-64 focus-within:max-w-64"
    >
      {/* 접힌 모습: 지금 보고 있는 제목 하나 */}
      <div aria-hidden data-outline-current className="flex items-center gap-2 px-3 py-2 text-muted-foreground group-focus-within:hidden group-hover:hidden">
        <ListTree className="size-4 shrink-0" />
        <span className="truncate">{current?.text ?? "목차"}</span>
      </div>

      {/* 펼친 모습: 전체 목차 */}
      <div className="hidden p-2 group-focus-within:block group-hover:block">
        <p className="flex items-center gap-2 px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">
          <ListTree className="size-3.5" /> 목차
        </p>
        {headings.length === 0 ? (
          <div className="space-y-3 px-2 pb-2 text-muted-foreground">
            <p>글에 제목(#, ##)을 넣으면 여기에 목차가 생겨요.</p>
            <Button size="sm" variant="outline" onClick={() => setDraftOpen(true)}>
              <Sparkles /> AI로 목차·초안 만들기
            </Button>
          </div>
        ) : (
          <ol className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {headings.map((heading) => (
              <li key={heading.pos}>
                <button
                  type="button"
                  title={heading.text}
                  aria-current={heading.pos === current?.pos ? "location" : undefined}
                  onClick={() => useEditorBridge.getState().bridge?.focusHeading(heading.pos)}
                  style={{ paddingLeft: `${0.5 + (heading.level - top) * 0.875}rem` }}
                  className={cn(
                    "block w-full truncate rounded-md py-1 pr-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground",
                    heading.level === top && "font-medium text-foreground/80",
                    heading.pos === current?.pos && "bg-accent text-foreground",
                  )}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </nav>
  );
}
