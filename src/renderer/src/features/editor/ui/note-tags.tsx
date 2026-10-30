import { Hash } from "lucide-react";
import { useMemo } from "react";

import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { TagAdder } from "@/entities/note/ui/tag-adder";
import { parseNote } from "@shared/note-parser";

interface NoteTagsProps {
  path: string;
  /** 지금 frontmatter (저장 전 태그도 바로 보이게) */
  frontmatter: string;
  getText: () => string;
  onAdd: (tags: string[]) => void;
}

/** 제목 바로 아래의 태그 줄. 누르면 태그 목록으로, `+ 태그`는 기존 태그에서 추천한다. */
export function NoteTags({ path, frontmatter, getText, onAdd }: NoteTagsProps) {
  const indexed = useNoteIndexStore((s) => s.entries.find((e) => e.path === path)?.tags);
  const tags = useMemo(() => {
    const all = [...parseNote(frontmatter).tags, ...(indexed ?? [])];
    const seen = new Set<string>();
    return all.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  }, [frontmatter, indexed]);

  return (
    <div aria-label="이 글의 태그" role="group" className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => useUiStore.getState().showTag(tag)}
          className="flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground hover:bg-accent/70"
        >
          <Hash className="size-3" />
          {tag}
        </button>
      ))}
      <TagAdder path={path} currentTags={tags} getText={getText} onAdd={onAdd} variant="subtle" />
    </div>
  );
}
