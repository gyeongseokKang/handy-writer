import { GitBranch, X } from "lucide-react";

import { useUiStore, type RightTab } from "@/entities/note/model/use-ui-store";
import { useEmbedStore } from "@/entities/note/model/use-embed-store";
import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { AiPanel } from "@/features/ai/ui/ai-panel";
import { AttachmentsPanel } from "@/features/attachments/ui/attachments-panel";
import { SpellPanel } from "@/features/editor/ui/spell-panel";
import { GitPanel } from "@/features/git/ui/git-panel";
import { TemplateList } from "@/features/templates/ui/template-list";
import { LinksPanel } from "@/features/note-links/ui/links-panel";
import { cn } from "@/shared/lib/utils";

const TABS: { id: RightTab; label: string }[] = [
  { id: "links", label: "연결" },
  { id: "files", label: "첨부" },
  { id: "ai", label: "AI" },
  { id: "spell", label: "맞춤법" },
];

function Badge({ count }: { count: number }) {
  return count > 0 ? <span className="ml-1 rounded-full bg-accent px-1.5 text-xs">{count}</span> : null;
}

/** 왼쪽 아래 브랜치를 누르면 탭 대신 보이는 Git 화면. X를 누르면 보던 탭으로 돌아간다. */
function GitView() {
  return (
    <aside aria-label="Git" className="flex h-full w-80 shrink-0 flex-col border-l bg-muted/20">
      <div className="flex h-10.5 shrink-0 items-center gap-2 border-b pr-1.5 pl-4 text-sm font-medium">
        <GitBranch className="size-4 text-muted-foreground" />
        Git
        <button
          type="button"
          aria-label="Git 닫기"
          title="Git 닫기"
          onClick={() => useUiStore.getState().closeGit()}
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GitPanel />
      </div>
    </aside>
  );
}

export function RightPanel() {
  const tab = useUiStore((s) => s.rightTab);
  const gitOpen = useUiStore((s) => s.gitOpen);
  const setTab = useUiStore((s) => s.setRightTab);
  const embedCount = useEmbedStore((s) => s.items.length);
  const spellCount = useSpellStore((s) => (s.enabled ? s.items.length : 0));

  if (gitOpen) return <GitView />;

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
            {id === "files" && <Badge count={embedCount} />}
            {id === "spell" && <Badge count={spellCount} />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "links" ? (
          <LinksPanel />
        ) : tab === "files" ? (
          <AttachmentsPanel />
        ) : tab === "ai" ? (
          <>
            <AiPanel />
            <TemplateList />
          </>
        ) : (
          <SpellPanel />
        )}
      </div>
    </aside>
  );
}
