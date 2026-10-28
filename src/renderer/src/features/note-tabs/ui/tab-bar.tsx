import { Columns2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { cn } from "@/shared/lib/utils";
import { ContextMenu, type MenuItem } from "@/shared/ui/context-menu";

/** 분할 화면에 띄울 글: 지금 글 말고 가장 가까운 탭 */
function neighborTab() {
  const { tabs, activePath } = useWorkspaceStore.getState();
  const index = activePath ? tabs.indexOf(activePath) : -1;
  return tabs[index - 1] ?? tabs[index + 1] ?? null;
}

/** Ctrl/Cmd+\ 와 막대의 분할 버튼: 분할 화면을 열고 닫는다. */
export function toggleSplit() {
  const { splitPath, openSplit } = useWorkspaceStore.getState();
  if (splitPath) return void openSplit(null);
  const target = neighborTab();
  if (target) return void openSplit(target);
  toast.info("옆에 띄울 글이 없어요. 글 목록에서 우클릭 → ‘옆에 열기’나 Alt+클릭으로 띄워 보세요.");
}

/** 열어 둔 글의 탭. 누르면 그 글로, 가운데 버튼이나 X로 닫고, 끌어서 순서를 바꾼다. */
export function TabBar() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const splitPath = useWorkspaceStore((s) => s.splitPath);
  const notes = useWorkspaceStore((s) => s.notes);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
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
              title={path}
              draggable
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
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
              {path === splitPath && <Columns2 aria-label="옆에 열림" className="size-3 shrink-0 text-muted-foreground" />}
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
      <button
        type="button"
        aria-label={splitPath ? "분할 화면 닫기" : "옆에 열기"}
        aria-pressed={splitPath !== null}
        title={splitPath ? "분할 화면 닫기 (Ctrl/Cmd+\\)" : "옆 탭을 오른쪽에 나란히 띄우기 (Ctrl/Cmd+\\)"}
        onClick={toggleSplit}
        className={cn("flex w-9 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent", splitPath && "bg-accent text-foreground")}
      >
        <Columns2 className="size-4" />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} label="탭 메뉴" items={menuItems(menu.path)} onClose={() => setMenu(null)} />}
    </div>
  );
}
