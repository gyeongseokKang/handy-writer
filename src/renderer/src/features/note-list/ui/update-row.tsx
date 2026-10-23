import { Download, RefreshCw } from "lucide-react";

import { useUpdateStore } from "@/entities/update/model/use-update-store";
import { api } from "@/shared/api/handy-api";
import { UPDATE_LABEL } from "@shared/update";

/** 사이드바 맨 아래의 업데이트 줄. 업데이트를 쓸 수 없는 환경(개발 모드 등)에서는 숨긴다. */
export function UpdateRow() {
  const state = useUpdateStore((s) => s.state);
  if (state.status === "unsupported") return null;

  const busy = state.status === "checking" || state.status === "downloading";
  if (state.status === "ready") {
    return (
      <button
        type="button"
        onClick={() => void api.update.install()}
        className="flex items-center gap-2 border-t bg-primary/10 px-4 py-2 text-left text-xs font-medium text-foreground hover:bg-primary/20"
      >
        <Download className="size-3.5 shrink-0" />
        <span className="truncate">{UPDATE_LABEL(state)} · 다시 시작해서 설치</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void api.update.check()}
      title="새 버전 확인"
      className="flex items-center gap-2 border-t px-4 py-2 text-left text-xs text-muted-foreground hover:bg-accent/70 disabled:opacity-70"
    >
      <RefreshCw className={busy ? "size-3.5 shrink-0 animate-spin" : "size-3.5 shrink-0"} />
      <span className="truncate">{state.status === "idle" ? "업데이트 확인" : UPDATE_LABEL(state)}</span>
    </button>
  );
}
