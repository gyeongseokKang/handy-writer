import { ArrowUpRight, FilePlus2, Hash, Link2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { backlinksOf, outgoingOf } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="px-4 py-3">
      <h2 className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        {title}
        {count !== undefined && <span className="font-normal">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

const rowClass = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/70";

export function LinksPanel() {
  const entries = useNoteIndexStore((state) => state.entries);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openNote = useWorkspaceStore((state) => state.openNote);
  const createNote = useWorkspaceStore((state) => state.createNote);
  const showTag = useUiStore((state) => state.showTag);

  const entry = useMemo(() => entries.find((e) => e.path === activePath), [entries, activePath]);
  const backlinks = useMemo(() => (activePath ? backlinksOf(entries, activePath) : []), [entries, activePath]);
  const outgoing = useMemo(() => (entry ? outgoingOf(entries, entry) : []), [entries, entry]);
  const nameByPath = useMemo(() => new Map(entries.map((e) => [e.path, e.name])), [entries]);

  if (!activePath) return null;

  return (
    <div aria-label="연결 정보" role="region" className="flex flex-col divide-y">
      <Section title="태그" count={entry?.tags.length ?? 0}>
        {entry && entry.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => showTag(tag)}
                className="flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs hover:bg-accent/70"
              >
                <Hash className="size-3" />
                {tag}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">이 글에는 태그가 없어요</p>
        )}
      </Section>

      <Section title="백링크" count={backlinks.length}>
        {backlinks.length > 0 ? (
          <ul aria-label="백링크">
            {backlinks.map((link) => (
              <li key={link.path}>
                <button type="button" className={rowClass} onClick={() => void openNote(link.path)}>
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{link.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">이 글을 가리키는 글이 없어요</p>
        )}
      </Section>

      <Section title="나가는 링크" count={outgoing.length}>
        {outgoing.length > 0 ? (
          <ul aria-label="나가는 링크">
            {outgoing.map(({ target, path }) => (
              <li key={target}>
                {path ? (
                  <button type="button" className={rowClass} onClick={() => void openNote(path)}>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{nameByPath.get(path) ?? target}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${rowClass} text-muted-foreground`}
                    title="아직 없는 글이에요. 눌러서 만들기"
                    onClick={() => void createNote("", target)}
                  >
                    <FilePlus2 className="size-4 shrink-0" />
                    <span className="truncate">{target}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">연결한 글이 없어요</p>
        )}
      </Section>
    </div>
  );
}
