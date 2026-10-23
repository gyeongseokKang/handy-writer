import { useUiStore } from "@/entities/note/model/use-ui-store";
import { AiPanel } from "@/features/ai/ui/ai-panel";
import { LinksPanel } from "@/features/note-links/ui/links-panel";
import { cn } from "@/shared/lib/utils";

const TABS = [
  { id: "links", label: "연결" },
  { id: "ai", label: "AI" },
] as const;

export function RightPanel() {
  const tab = useUiStore((s) => s.rightTab);
  const setTab = useUiStore((s) => s.setRightTab);

  return (
    <aside aria-label="사이드 패널" className="flex h-full w-80 shrink-0 flex-col border-l bg-muted/20">
      <div role="tablist" aria-label="패널 보기" className="grid shrink-0 grid-cols-2 border-b text-sm">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("py-2.5 text-muted-foreground", tab === id && "border-b-2 border-primary font-medium text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === "links" ? <LinksPanel /> : <AiPanel />}</div>
    </aside>
  );
}
