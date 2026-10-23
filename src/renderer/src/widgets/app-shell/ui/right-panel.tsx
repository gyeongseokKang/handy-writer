import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { AiPanel } from "@/features/ai/ui/ai-panel";
import { AttachmentsPanel } from "@/features/attachments/ui/attachments-panel";
import { GitPanel } from "@/features/git/ui/git-panel";
import { TemplateList } from "@/features/templates/ui/template-list";
import { LinksPanel } from "@/features/note-links/ui/links-panel";
import { cn } from "@/shared/lib/utils";

const TABS = [
  { id: "links", label: "연결" },
  { id: "files", label: "첨부" },
  { id: "ai", label: "AI" },
  { id: "git", label: "Git" },
] as const;

export function RightPanel() {
  const tab = useUiStore((s) => s.rightTab);
  const setTab = useUiStore((s) => s.setRightTab);
  const embedCount = useEmbedStore((s) => s.items.length);

  return (
    <aside aria-label="사이드 패널" className="flex h-full w-80 shrink-0 flex-col border-l bg-muted/20">
      <div role="tablist" aria-label="패널 보기" className="grid shrink-0 grid-cols-4 border-b text-sm">
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
            {id === "files" && embedCount > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-xs">{embedCount}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{tab === "links" ? <LinksPanel /> : tab === "files" ? <AttachmentsPanel /> : tab === "ai" ? (
            <>
              <AiPanel />
              <TemplateList />
            </>
          ) : <GitPanel />}</div>
    </aside>
  );
}
