import { useEffect, useState } from "react";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";

interface NoteTitleProps {
  path: string;
  name: string;
  /** 제목 입력에서 Enter를 누르면 본문으로 포커스를 넘긴다. */
  onEnter: () => void;
}

/** 글 제목은 곧 파일 이름이다. 입력을 마치면 파일 이름을 바꾼다. */
export function NoteTitle({ path, name, onEnter }: NoteTitleProps) {
  const renameNote = useWorkspaceStore((state) => state.renameNote);
  const [value, setValue] = useState(name);

  useEffect(() => setValue(name), [name, path]);

  const commit = async () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    if (!(await renameNote(path, next))) setValue(name);
  };

  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter();
        }
      }}
      placeholder="제목 없음"
      aria-label="글 제목"
      className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
    />
  );
}
