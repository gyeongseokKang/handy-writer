import { useEffect, useRef, useState } from "react";

import { useSpellStore } from "@/entities/note/model/use-spell-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { cn } from "@/shared/lib/utils";


const ONLINE_STATE_TEXT = {
  unknown: "아직 확인하지 않았어요",
  ok: "연결됨",
  offline: "오프라인이라 건너뛰고 있어요",
} as const;

/** 아래 막대의 "맞춤법" 버튼과 그 설정 창 (표시 켜기/끄기, 온라인 검사). */
export function SpellMenu() {
  const enabled = useSpellStore((s) => s.enabled);
  const online = useSpellStore((s) => s.online);
  const onlineState = useSpellStore((s) => s.onlineState);
  const count = useSpellStore((s) => s.count);
  const style = useSpellStore((s) => s.style);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const label = !enabled ? "맞춤법 끔" : count > 0 ? `맞춤법 ${count}` : "맞춤법 ✓";

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="맞춤법 설정"
        onClick={() => setOpen((v) => !v)}
        className={cn("rounded px-1.5 py-0.5 hover:bg-accent", open && "bg-accent")}
      >
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label="맞춤법 설정" className="absolute right-0 whitespace-normal bottom-full z-40 mb-2 w-72 space-y-3 rounded-lg border bg-card p-3 text-sm text-foreground shadow-lg">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => useSpellStore.getState().setEnabled(e.target.checked)} />
            맞춤법 표시
          </label>
          <div className="space-y-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={style} onChange={(e) => useSpellStore.getState().setStyle(e.target.checked)} />
              문장 다듬기 표시
            </label>
            <p className="pl-6 text-xs text-muted-foreground">긴 문장, 한 문장 안의 되풀이, 겹말, 이중 피동, 번역투를 파란 점선으로 알려 줘요.</p>
            <button type="button" onClick={() => (setOpen(false), useUiStore.getState().setStyleSettingsOpen(true))} className="ml-6 text-xs text-primary underline-offset-2 hover:underline">
              다듬기 설정·내 표기 사전…
            </button>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={online} disabled={!enabled} onChange={(e) => useSpellStore.getState().setOnline(e.target.checked)} />
              온라인 검사 (다음·네이버)
            </label>
            <p className="pl-6 text-xs text-muted-foreground">
              {online && enabled ? `상태: ${ONLINE_STATE_TEXT[onlineState]}` : "꺼져 있어요. 자주 틀리는 표기만 검사해요."}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            온라인 검사를 켜면 쓰고 있는 <strong>문단의 내용이 다음·네이버 서버로 전송</strong>돼요. 인터넷에 연결돼 있지 않으면 자동으로 건너뛰어요. 코드, 주소, #태그는 보내지 않아요.
          </p>
        </div>
      )}
    </div>
  );
}
