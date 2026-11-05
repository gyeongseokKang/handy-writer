import { DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, useUiStore } from "@/entities/note/model/use-ui-store";
import { PanelResizeHandle } from "@/shared/ui/panel-resize-handle";

/** 사이드바 오른쪽 가장자리 손잡이. 끌면 너비가 바뀌고, 두 번 누르면 기본 너비로 돌아간다. */
export function SidebarResizeHandle() {
  const width = useUiStore((s) => s.sidebarWidth);
  const setWidth = useUiStore((s) => s.setSidebarWidth);
  return (
    <PanelResizeHandle edge="right" width={width} setWidth={setWidth} min={MIN_SIDEBAR_WIDTH} max={MAX_SIDEBAR_WIDTH} fallback={DEFAULT_SIDEBAR_WIDTH} label="사이드바 너비 조절" />
  );
}
