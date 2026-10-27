import { formatLogLine, type LogEntry } from "@shared/log";
import { Copy, FolderOpen, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { useLogStore } from "@/entities/log/model/use-log-store";
import { api } from "@/shared/api/handy-api";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const pad = (n: number) => String(n).padStart(2, "0");
/** 17:46:22 */
const time = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function Row({ entry }: { entry: LogEntry }) {
  const [first, ...rest] = entry.message.split("\n");
  return (
    <li className="flex gap-3 border-b px-4 py-2 last:border-b-0">
      <span className="shrink-0 pt-px font-mono text-xs text-muted-foreground tabular-nums">{time(entry.time)}</span>
      <TriangleAlert className={cn("mt-0.5 size-3.5 shrink-0", entry.level === "error" ? "text-destructive" : "text-amber-600")} aria-label={entry.level === "error" ? "오류" : "경고"} />
      <span className="h-fit shrink-0 rounded bg-muted px-1.5 text-xs leading-5 text-muted-foreground">{entry.source}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-words whitespace-pre-wrap">{first}</p>
        {rest.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">자세히</summary>
            <pre className="mt-1 overflow-x-auto font-mono text-xs leading-5 whitespace-pre text-muted-foreground">{rest.join("\n")}</pre>
          </details>
        )}
      </div>
    </li>
  );
}

/** 에디터 아래에서 올라오는 오류 로그 창. 최근 것이 위에 온다. */
export function LogPanel() {
  const entries = useLogStore((s) => s.entries);
  const setOpen = useLogStore((s) => s.setOpen);
  const clear = useLogStore((s) => s.clear);
  const newestFirst = [...entries].reverse();

  const copy = () => {
    void navigator.clipboard
      .writeText(entries.map(formatLogLine).join("\n"))
      .then(() => toast.success("로그를 복사했어요."))
      .catch(() => toast.error("로그를 복사하지 못했어요."));
  };

  return (
    <section
      role="region"
      aria-label="오류 로그 창"
      className="absolute inset-x-0 bottom-0 z-20 flex h-72 flex-col border-t bg-card shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <header className="flex items-center gap-2 border-b px-4 py-1.5">
        <h2 className="flex-1 text-sm font-semibold">
          오류 로그 <span className="font-normal text-muted-foreground">{entries.length}</span>
        </h2>
        <Button size="sm" variant="ghost" className="h-7" disabled={entries.length === 0} onClick={copy}>
          <Copy /> 복사
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => void api.log.reveal()}>
          <FolderOpen /> 로그 파일
        </Button>
        <Button size="sm" variant="ghost" className="h-7" disabled={entries.length === 0} onClick={() => void clear()}>
          <Trash2 /> 지우기
        </Button>
        <Button size="icon" variant="ghost" className="size-7" aria-label="로그 창 닫기" autoFocus onClick={() => setOpen(false)}>
          <X />
        </Button>
      </header>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">기록된 오류가 없어요.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {newestFirst.map((entry) => (
            <Row key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}
