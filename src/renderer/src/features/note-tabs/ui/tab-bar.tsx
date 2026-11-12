import { Columns2, Flame, PanelRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useUiStore } from "@/entities/note/model/use-ui-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { ReadAloudButton } from "@/features/read-aloud/ui/read-aloud";
import { NOTE_DRAG_TYPE } from "@/shared/lib/note-drag";
import { noteExcerpt } from "@/shared/lib/note-excerpt";
import { api } from "@/shared/api/handy-api";
import { shortcutLabel } from "@/shared/lib/shortcut";
import { cn } from "@/shared/lib/utils";
import { ContextMenu, type MenuItem } from "@/shared/ui/context-menu";

/** 분할 화면에 띄울 글: 지금 글 말고 가장 가까운 탭 */
function neighborTab() {
  const { tabs, activePath } = useWorkspaceStore.getState();
  const index = activePath ? tabs.indexOf(activePath) : -1;
  return tabs[index - 1] ?? tabs[index + 1] ?? null;
}

/** Ctrl/Cmd+\: 분할 화면을 모두 닫거나, 없으면 옆 탭을 나란히 띄운다. (탭·글을 에디터 쪽으로 끌어 놓아도 띄운다) */
export function toggleSplit() {
  const { splitPaths, openSplit } = useWorkspaceStore.getState();
  if (splitPaths.length > 0) return void openSplit(null);
  const target = neighborTab();
  if (target) return void openSplit(target);
  toast.info("옆에 띄울 글이 없어요. 글 목록에서 우클릭 → ‘옆에 열기’나 Alt+클릭으로 띄워 보세요.");
}

/** 열어 둔 글의 탭. 누르면 그 글로, 가운데 버튼이나 X로 닫고, 끌어서 순서를 바꾼다. */
export function TabBar() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const splitPaths = useWorkspaceStore((s) => s.splitPaths);
  const notes = useWorkspaceStore((s) => s.notes);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const preview = useTabPreview();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath]);

  const nameOf = (path: string) => notes.find((note) => note.path === path)?.name ?? path.replace(/\.md$/, "");
  const { openNote, closeTab, moveTab, openSplit } = useWorkspaceStore.getState();

  const menuItems = (path: string): MenuItem[] => [
    { label: "닫기", onSelect: () => void closeTab(path) },
    {
      label: "다른 탭 모두 닫기",
      disabled: tabs.length < 2,
      onSelect: () => void Promise.all(tabs.filter((tab) => tab !== path).map(closeTab)).then(() => openNote(path)),
    },
    "separator",
    { label: "옆에 열기", disabled: path === activePath, onSelect: () => void openSplit(path) },
  ];

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b bg-muted/30">
      <div ref={listRef} role="tablist" aria-label="열린 글" className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]">
        {tabs.map((path, index) => {
          const active = path === activePath;
          return (
            <div
              key={path}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              draggable
              onMouseEnter={(event) => !active && dragging === null && preview.show(path, event.currentTarget)}
              onMouseLeave={preview.hide}
              onDragStart={(event) => {
                preview.hide();
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
                // 에디터 쪽에 끌어 놓으면 나란히 띄운다.
                event.dataTransfer.setData(NOTE_DRAG_TYPE, path);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => dragging !== null && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null && dragging !== index) moveTab(dragging, index);
                setDragging(null);
              }}
              onClick={() => void openNote(path)}
              onAuxClick={(event) => {
                if (event.button === 1) void closeTab(path);
              }}
              onMouseDown={(event) => event.button === 1 && event.preventDefault()}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ x: event.clientX, y: event.clientY, path });
              }}
              className={cn(
                "group relative flex max-w-52 min-w-24 shrink-0 cursor-default items-center gap-1 border-r pr-1 pl-3 text-sm select-none",
                active ? "bg-background text-foreground" : "text-muted-foreground hover:bg-background/60",
                dragging === index && "opacity-50",
              )}
            >
              {active && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
              <span className="min-w-0 flex-1 truncate">{nameOf(path)}</span>
              {splitPaths.includes(path) && <Columns2 aria-label="옆에 열림" className="size-3 shrink-0 text-muted-foreground" />}
              <button
                type="button"
                aria-label={`${nameOf(path)} 탭 닫기`}
                title="닫기 (Ctrl/Cmd+W)"
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(path);
                }}
                className={cn("rounded p-0.5 hover:bg-accent", active ? "opacity-70" : "opacity-0 group-hover:opacity-70")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <ReadAloudButton />
      <FocusModeButton />
      <RightPanelToggle />
      {preview.state && <TabPreviewCard {...preview.state} name={nameOf(preview.state.path)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} label="탭 메뉴" items={menuItems(menu.path)} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** 탭 막대 오른쪽 끝(오른쪽 패널 바로 옆)의 패널 접기·펼치기 버튼 */
function RightPanelToggle() {
  const open = useUiStore((s) => s.rightPanelOpen);
  return (
    <button
      type="button"
      aria-label="오른쪽 패널"
      aria-pressed={open}
      title={open ? "오른쪽 패널 접기" : "오른쪽 패널 펼치기"}
      onClick={() => useUiStore.getState().toggleRightPanel()}
      className={cn("flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground", open && "text-foreground")}
    >
      <PanelRight className="size-4" />
    </button>
  );
}

/** 집중 모드로 바로 들어가는 불꽃 버튼. 올리면 불이 붙듯 주황빛으로 바뀐다. */
function FocusModeButton() {
  return (
    <button
      type="button"
      aria-label="집중 모드"
      title={`집중 모드 — 글만 남기고 지금 문단에 불을 켜요 (${shortcutLabel("Mod+Shift+D")})`}
      onClick={() => useUiStore.getState().setFocusMode(true)}
      className="group/focus flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors hover:bg-orange-500/10 hover:text-orange-500"
    >
      <Flame className="size-4 transition-transform group-hover/focus:scale-110 group-hover/focus:fill-orange-400/40 group-hover/focus:drop-shadow-[0_0_4px_rgba(249,115,22,0.6)]" />
    </button>
  );
}

const PREVIEW_DELAY_MS = 450;
const PREVIEW_WIDTH = 340;

interface PreviewState { path: string; left: number; top: number; raw: string }

/** 탭에 마우스를 잠깐 올리면 그 글을 읽어 미리보기 자리를 정한다. 벗어나거나 끌기 시작하면 닫는다. */
function useTabPreview() {
  const [state, setState] = useState<PreviewState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hovered = useRef<string | null>(null);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    hovered.current = null;
    setState(null);
  }, []);
  const show = useCallback((path: string, el: HTMLElement) => {
    window.clearTimeout(timer.current);
    hovered.current = path;
    timer.current = window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      void api.notes.read(path).then((raw) => {
        if (hovered.current !== path) return;
        setState({ path, raw, left: Math.max(8, Math.min(rect.left, window.innerWidth - PREVIEW_WIDTH - 8)), top: rect.bottom + 4 });
      }, () => {});
    }, PREVIEW_DELAY_MS);
  }, []);
  useEffect(() => {
    window.addEventListener("mousedown", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("mousedown", hide, true);
      window.removeEventListener("blur", hide);
      window.clearTimeout(timer.current);
    };
  }, [hide]);
  return { state, show, hide };
}

/** 탭 미리보기: 글 이름·폴더, 앞부분 몇 줄, 글자 수 */
function TabPreviewCard({ path, name, left, top, raw }: PreviewState & { name: string }) {
  const { lines, truncated } = noteExcerpt(raw);
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const chars = raw.replace(/^---[\s\S]*?\n---\n?/, "").replace(/\s/g, "").length;
  return (
    <div
      role="tooltip"
      aria-label={`${name} 미리보기`}
      style={{ left, top, width: PREVIEW_WIDTH }}
      className="pointer-events-none fixed z-50 space-y-1.5 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        {folder && <p className="truncate text-[11px] text-muted-foreground">{folder}</p>}
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-muted-foreground">빈 글이에요</p>
      ) : (
        <div className="max-h-40 space-y-0.5 overflow-hidden text-xs leading-5 text-muted-foreground [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
          {lines.slice(0, 8).map((line, i) => (
            <p key={i} className={cn("line-clamp-2", line.heading && "font-semibold text-foreground")}>{line.text}</p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/80">{chars.toLocaleString()}자{truncated || lines.length > 8 ? " · 앞부분만" : ""}</p>
    </div>
  );
}
