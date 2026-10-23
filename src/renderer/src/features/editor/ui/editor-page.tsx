import { PenLine } from "lucide-react";
import { toast } from "sonner";

import { countChars, useEditorStore } from "@/features/editor/model/use-editor-store";
import { Button } from "@/shared/ui/button";

export function EditorPage() {
  const { title, content, setTitle, setContent } = useEditorStore();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <PenLine className="size-5" />
          Handy Writer
        </div>
        <Button size="sm" onClick={() => toast.success("저장 기능은 곧 추가됩니다")}>
          저장
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-hidden px-6 py-8">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="bg-transparent text-3xl font-bold outline-none placeholder:text-muted-foreground"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="여기에 글을 써보세요..."
          className="flex-1 resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground"
        />
      </main>

      <footer className="border-t px-6 py-2 text-xs text-muted-foreground">
        {countChars(content).toLocaleString()}자 (공백 제외)
      </footer>
    </div>
  );
}
