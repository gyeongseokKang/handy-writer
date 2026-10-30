import { Keyboard, X } from "lucide-react";

import { useCommandStore } from "@/entities/command/model/use-command-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { shortcutLabel } from "@/shared/lib/shortcut";

import { EDITOR_SHORTCUTS } from "../model/commands";

function Keys({ keys }: { keys: string }) {
  return <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground">{keys.length <= 2 && !keys.includes("+") ? keys : shortcutLabel(keys)}</kbd>;
}

/** Cmd/Ctrl+/ 로 여는 단축키 안내. 명령 팔레트와 같은 목록에서 단축키가 있는 것만 묶음별로 보여 준다. */
export function ShortcutsDialog() {
  const close = () => useUiStore.getState().setShortcutsOpen(false);
  const commands = useCommandStore((s) => s.commands).filter((c) => c.shortcut);
  const groups = [...new Set(commands.map((c) => c.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[8vh]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="단축키"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        className="w-full max-w-xl space-y-4 rounded-xl border bg-card px-6 py-5 text-sm shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Keyboard className="size-4" /> 단축키
          </h2>
          <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{group}</h3>
              <ul className="space-y-1">
                {commands
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span>{c.title}</span>
                      <Keys keys={c.shortcut!} />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <section aria-label="쓰기">
            <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">쓰기</h3>
            <ul className="space-y-1">
              {EDITOR_SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">{s.label}</span>
                  <Keys keys={s.keys} />
                </li>
              ))}
            </ul>
          </section>
        </div>
        <p className="border-t pt-3 text-xs text-muted-foreground">
          모든 명령은 {shortcutLabel("Mod+K")}를 누르고 <kbd className="rounded border bg-muted px-1">&gt;</kbd>를 입력해 이름으로 찾아 실행할 수 있어요 ({shortcutLabel("Mod+Shift+P")}).
        </p>
      </div>
    </div>
  );
}
