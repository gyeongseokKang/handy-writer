import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

  // 긴 제목은 줄을 넘겨 다 보이게 한다 (줄바꿈은 넣지 않고 높이만 맞춘다).
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const commit = async () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    if (!(await renameNote(path, next))) setValue(name);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      // 붙여 넣은 줄바꿈은 빈칸으로 (파일 이름이라 한 줄)
      onChange={(event) => setValue(event.target.value.replace(/\r?\n/g, " "))}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter();
        }
      }}
      placeholder="제목 없음"
      aria-label="글 제목"
      className="block w-full resize-none overflow-hidden bg-transparent text-4xl leading-tight font-bold tracking-tight [overflow-wrap:anywhere] outline-none placeholder:text-muted-foreground/50"
    />
  );
}
