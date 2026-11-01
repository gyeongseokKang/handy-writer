import { CircleHelp, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useCommandStore } from "@/entities/command/model/use-command-store";
import { useUiStore } from "@/entities/note/model/use-ui-store";
import { cn } from "@/shared/lib/utils";
import { matchesCommand, shortcutLabel } from "@/shared/lib/shortcut";
import { Button } from "@/shared/ui/button";

import SIZES from "../../../shared/assets/help/sizes.json";
import { HELP_FEATURES, HELP_GROUPS, type HelpFeature } from "../model/help-content";

/** 그림은 모두 webp로 만들어 앱에 함께 묶는다 (`pnpm docs:screenshots`). 이름(확장자 없이) → 주소 */
const IMAGES = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../../../shared/assets/help/*.webp", { eager: true, query: "?url", import: "default" })).map(([path, url]) => [
    /([^/]+)\.webp$/.exec(path)?.[1] ?? path,
    url,
  ]),
);

/** `…`로 감싼 부분을 코드 모양으로 보여 준다. */
function Inline({ text }: { text: string }): ReactNode {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function Keys({ keys }: { keys: string }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs whitespace-nowrap text-muted-foreground">{keys.length <= 2 && !keys.includes("+") ? keys : shortcutLabel(keys)}</kbd>;
}

function Feature({ feature, onTry }: { feature: HelpFeature; onTry: (commandId: string) => void }) {
  const image = IMAGES[feature.image];
  const size = (SIZES as Record<string, number[]>)[feature.image];
  const command = useCommandStore((s) => s.commands.find((c) => c.id === feature.command?.id));
  const disabled = command?.enabled?.() === false;
  return (
    <article id={`help-${feature.id}`} aria-label={feature.title} className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-semibold">
          <Inline text={feature.title} />
        </h4>
        {feature.shortcuts?.map((keys) => <Keys key={keys} keys={keys} />)}
        {feature.command && command && (
          <Button size="sm" variant="outline" className="ml-auto h-7" disabled={disabled} onClick={() => onTry(command.id)}>
            지금 써 보기
          </Button>
        )}
      </div>
      {image && (
        <img
          src={image}
          alt={`${feature.title} 화면`}
          // 크기를 알려 주면 불러오기 전에도 자리를 잡아서, 목록에서 이동할 때 스크롤 위치가 밀리지 않는다.
          width={size?.[0]}
          height={size?.[1]}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-auto max-w-full rounded-lg border bg-background shadow-sm"
        />
      )}
      <p className="text-sm leading-7 text-foreground/90">
        <Inline text={feature.summary} />
      </p>
      {feature.steps && (
        <ul className="space-y-1 text-sm leading-6 text-muted-foreground">
          {feature.steps.map((step) => (
            <li key={step} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>
                <Inline text={step} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** 사이드바 위의 ? 아이콘(또는 F1)으로 여는 도움말. 에디터가 제공하는 기능을 그림과 함께 묶음별로 늘어놓는다. */
export function HelpDialog() {
  const ui = useUiStore();
  const close = () => ui.setHelpOpen(false);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => HELP_FEATURES.filter((f) => !query.trim() || matchesCommand(query, f.title, f.summary, ...(f.steps ?? []), ...(f.keywords ?? []))),
    [query],
  );
  const groups = HELP_GROUPS.map((group) => ({ group, features: visible.filter((f) => f.group === group.id) })).filter((g) => g.features.length > 0);

  // 열릴 때 창에 포커스를 두어 Esc가 닫게 하고, 특정 기능으로 열렸으면 그 자리로 간다.
  useEffect(() => {
    dialogRef.current?.focus();
    if (ui.helpFeature) document.getElementById(`help-${ui.helpFeature}`)?.scrollIntoView({ block: "start" });
    // 열릴 때 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (id: string) => document.getElementById(`help-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  const tryCommand = (commandId: string) => {
    close();
    useCommandStore.getState().commands.find((c) => c.id === commandId)?.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="도움말"
        tabIndex={-1}
        className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl border bg-card text-sm shadow-2xl outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <nav aria-label="기능 목록" className="hidden w-56 shrink-0 overflow-y-auto border-r bg-muted/40 p-3 md:block">
          {groups.map(({ group, features }) => (
            <div key={group.id} className="mb-3">
              <button type="button" onClick={() => go(`group-${group.id}`)} className="w-full rounded px-2 py-1 text-left text-xs font-semibold text-muted-foreground hover:bg-accent">
                {group.title}
              </button>
              <ul>
                {features.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => go(f.id)} className="w-full truncate rounded px-2 py-1 text-left hover:bg-accent">
                      {f.title.replaceAll("`", "")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b px-6 py-3">
            <h2 className="flex shrink-0 items-center gap-1.5 text-base font-semibold">
              <CircleHelp className="size-4" /> 도움말
            </h2>
            <span className="hidden text-xs text-muted-foreground sm:inline">에디터가 제공하는 기능을 그림과 함께 모았어요 · {HELP_FEATURES.length}개</span>
            <label className="relative ml-auto w-56 max-w-[40%]">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="기능 찾기"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="기능 찾기 (예: 원고, 태그)"
                className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </label>
            <button type="button" aria-label="닫기" onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent">
              <X className="size-4" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-12 overflow-y-auto px-6 py-6 md:px-10">
            {groups.length === 0 && <p className="py-16 text-center text-muted-foreground">‘{query}’에 맞는 기능이 없어요.</p>}
            {groups.map(({ group, features }) => (
              <section key={group.id} aria-label={group.title} className="space-y-8">
                <div id={`help-group-${group.id}`} className="scroll-mt-4 border-b pb-2">
                  <h3 className="text-lg font-bold">{group.title}</h3>
                  <p className={cn("text-xs text-muted-foreground")}>{group.description}</p>
                </div>
                {features.map((feature) => (
                  <Feature key={feature.id} feature={feature} onTry={tryCommand} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
