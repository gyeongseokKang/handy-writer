import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";

export interface RepoMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** 메뉴 맨 위에 흐리게 보여 줄 설명 줄 */
  hint?: boolean;
}

/**
 * 사이드바 파일 트리 맨 위의 저장소 머리줄. 이름·브랜치·상태를 보여 주고, 누르면 트리를 접고 펼친다.
 * 오른쪽 ⋯ 메뉴에 Git 관련 동작·설정을 모은다. 스크롤해도 맨 위에 붙어 있다.
 */
export function RepoSectionHeader({
  icon, name, branch, status, open, onToggle, menu, actions, title, onBranchClick, branchLabel, branchActive,
}: {
  icon: ReactNode;
  name: string;
  branch?: string | null;
  /** 오른쪽에 붙는 상태(●2 ↑1 ↓3, 배포 아이콘 등) */
  status?: ReactNode;
  open: boolean;
  onToggle: () => void;
  menu: RepoMenuItem[];
  /** ⋯ 앞에 둘 바로가기 버튼(동기화 등) */
  actions?: ReactNode;
  title?: string;
  /** 있으면 브랜치·상태 부분이 따로 눌리는 버튼이 된다 (예: Git 화면 열기) */
  onBranchClick?: () => void;
  branchLabel?: string;
  branchActive?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // 메뉴는 화면 기준(fixed)으로 띄워서 스크롤 칸에 잘리지 않게 하고, 아래 자리가 모자라면 위로 연다.
  const [menuPos, setMenuPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openMenu = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    setMenuPos(below < 240 ? { left: rect.left + 8, width: rect.width - 16, bottom: window.innerHeight - rect.top + 2 } : { left: rect.left + 8, width: rect.width - 16, top: rect.bottom - 2 });
    setMenuOpen(true);
  };
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      const t = event.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setMenuOpen(false);
    };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    const shut = () => setMenuOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    // 화면 기준으로 띄운 메뉴라 스크롤·창 크기가 바뀌면 닫는다.
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", shut, true); window.removeEventListener("resize", shut);
    };
  }, [menuOpen]);

  return (
    <div ref={ref} className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
      <div className="group flex items-center gap-1 px-2 py-1.5 text-xs">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={title}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-accent/70"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="max-w-[60%] shrink-0 truncate font-semibold text-foreground">{name}</span>
          {!onBranchClick && branch && <span className="min-w-0 truncate text-muted-foreground">{branch}</span>}
          {!onBranchClick && status && <span className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground">{status}</span>}
        </button>
        {onBranchClick && (
          <button
            type="button"
            onClick={onBranchClick}
            aria-label={branchLabel}
            aria-expanded={branchActive}
            title={branchLabel}
            className={cn("flex min-w-0 shrink items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-accent/70 hover:text-foreground", branchActive && "bg-accent text-foreground")}
          >
            {branch && <span className="truncate">{branch}</span>}
            {status}
          </button>
        )}
        {actions}
        <button
          type="button"
          aria-label={`${name} Git 메뉴`}
          aria-expanded={menuOpen}
          title={`${name} Git 메뉴`}
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          className={cn("flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground", menuOpen && "bg-accent text-foreground")}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </div>
      {/* 머리줄의 backdrop-blur가 fixed 위치의 기준이 되어 버려서, 메뉴는 body에 띄운다. */}
      {menuOpen && menuPos && createPortal(
        <div ref={menuRef} role="menu" style={menuPos} className="fixed z-50 rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
          {menu.map((item, i) => item.hint ? (
            <p key={i} className="px-2 py-1 text-[11px] text-muted-foreground">{item.label}</p>
          ) : (
            <button
              key={i}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => { setMenuOpen(false); item.onSelect(); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">{item.icon}</span>{item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
      <div className="mx-2 border-b" />
    </div>
  );
}

/** 섹션을 접었는지 이 컴퓨터에 기억한다. */
export function useSectionOpen(key: string, fallback = true): [boolean, () => void] {
  const storageKey = `handy-writer:section-open:${key}`;
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(storageKey); return v === null ? fallback : v === "1"; } catch { return fallback; }
  });
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem(storageKey, v ? "0" : "1"); } catch { /* 이번 실행에만 */ }
    return !v;
  });
  return [open, toggle];
}
