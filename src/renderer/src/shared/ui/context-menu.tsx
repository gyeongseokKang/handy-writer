import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export type MenuItem =
  | { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }
  | "separator";

interface ContextMenuProps {
  /** 연 위치 (화면 좌표) */
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
}

const MARGIN = 8;

/** 우클릭 메뉴. 화면 밖으로 나가지 않게 위치를 맞추고, 화살표·Enter·Esc로 쓸 수 있다. */
export function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
    el.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus();
  }, [x, y]);

  // 바깥을 누르거나, 창을 벗어나거나, 스크롤하면 닫는다.
  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? buttons[0] : buttons.at(-1))?.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={position}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
    >
      {items.map((item, index) =>
        item === "separator" ? (
          <div key={`sep-${index}`} role="separator" className="-mx-1 my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
              item.danger && "text-destructive [&_svg]:text-destructive",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
