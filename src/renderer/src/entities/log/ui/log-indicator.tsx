import { TriangleAlert } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { selectUnread, useLogStore } from "../model/use-log-store";

/** 상태 막대 오른쪽 끝. 기록이 있을 때만 보이고, 누르면 로그 창을 열고 닫는다. */
export function LogIndicator() {
  const count = useLogStore((s) => s.entries.length);
  const unread = useLogStore(selectUnread);
  const open = useLogStore((s) => s.open);
  if (count === 0) return null;
  return (
    <button
      type="button"
      aria-label="오류 로그"
      aria-pressed={open}
      title={unread > 0 ? `새 오류 ${unread}개 · 눌러서 로그 보기` : `오류 로그 ${count}개`}
      onClick={() => useLogStore.getState().setOpen(!open)}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 tabular-nums hover:bg-accent",
        unread > 0 ? "font-medium text-destructive" : "text-muted-foreground",
        open && "bg-accent",
      )}
    >
      <TriangleAlert className="size-3.5" />
      {unread > 0 ? unread : count}
    </button>
  );
}
