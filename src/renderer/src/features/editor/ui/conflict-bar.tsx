import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { DiffBody } from "@/shared/ui/diff-body";

interface ConflictBarProps {
  /** 지금 에디터의 내용 (파일 전체) */
  mine: string;
  /** 다른 곳에서 바뀐 파일 내용 */
  theirs: string;
  onResolve: (choice: "mine" | "theirs") => void;
}

/** 저장하지 않은 내 변경이 있는데 다른 프로그램이 같은 글을 바꿨을 때. 고를 때까지 자동 저장을 멈춘다. */
export function ConflictBar({ mine, theirs, onResolve }: ConflictBarProps) {
  const [showDiff, setShowDiff] = useState(false);
  return (
    <>
      <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-amber-500/40 bg-amber-500/10 px-6 py-2 text-sm">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="min-w-0 flex-1">이 글이 다른 곳(Obsidian, git 등)에서도 바뀌었어요. 어느 쪽을 남길지 고를 때까지 저장을 멈췄어요.</span>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setShowDiff(true)}>
          차이 보기
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={() => onResolve("theirs")}>
          바깥 내용 불러오기
        </Button>
        <Button size="sm" className="h-7" onClick={() => onResolve("mine")}>
          내 것으로 덮어쓰기
        </Button>
      </div>
      {showDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={() => setShowDiff(false)}>
          <div
            role="dialog"
            aria-label="바깥 변경과 내 변경의 차이"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.key === "Escape" && setShowDiff(false)}
          >
            <div className="flex items-center gap-3 border-b px-5 py-3">
              <h2 className="font-semibold">차이 보기</h2>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="history-legend removed" /> 바깥 내용에만 있음</span>
                <span className="flex items-center gap-1"><span className="history-legend added" /> 내 변경에만 있음</span>
              </span>
              <button type="button" aria-label="닫기" onClick={() => setShowDiff(false)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <DiffBody before={theirs} after={mine} collapse active />
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button size="sm" variant="outline" onClick={() => onResolve("theirs")}>
                바깥 내용 불러오기
              </Button>
              <Button size="sm" onClick={() => onResolve("mine")}>
                내 것으로 덮어쓰기
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
