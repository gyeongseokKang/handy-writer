import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 스크롤바로 보는 너비 (macOS의 겹쳐 뜨는 스크롤바도 이 자리에 나타난다) */
const BAR_ZONE = 16;
const CARD_WIDTH = 320;
const CARD_BODY_HEIGHT = 210;
/** 미리보기에 담을 글의 높이(실제 크기 기준) */
const SLICE_HEIGHT = 520;

interface Peek {
  y: number;
  right: number;
  start: number;
  html: string;
  heading: string;
  percent: number;
  zoom: number;
  width: number;
}

/**
 * 글 칸 오른쪽 스크롤바에 마우스를 올리면, 그 높이에 해당하는 부분을 작게 미리 보여 준다.
 * 그 자리의 블록들을 복사해 줄여서 그리고, 가장 가까운 앞 제목과 위치(%)를 함께 보여 준다.
 */
export function ScrollPeek({ columnRef }: { columnRef: React.RefObject<HTMLDivElement | null> }) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef<{ start: number; html: string; heading: string } | null>(null);

  useEffect(() => {
    const scroller = columnRef.current?.closest<HTMLElement>("[data-note-scroller]");
    if (!scroller) return;
    const hide = () => {
      last.current = null;
      setPeek(null);
    };
    /** 스크롤바 자리에 마우스가 있는지. 스크롤바를 끄는 동안에는 마우스 이벤트가 오지 않아 스크롤로 따라간다. */
    const active = { current: false };
    const update = (clientX: number, clientY: number) => {
      const rect = scroller.getBoundingClientRect();
      if (scroller.scrollHeight <= scroller.clientHeight + 1 || clientX < rect.right - BAR_ZONE || clientX > rect.right) {
        active.current = false;
        return hide();
      }
      active.current = true;
      render(Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)), clientY);
    };
    /** 스크롤이 움직이면(스크롤바를 끌거나 그 위에서 휠) 지금 위치로 다시 그리고, 카드는 스크롤바 손잡이 옆에 붙인다. */
    const onScroll = () => {
      if (!active.current) return;
      const rect = scroller.getBoundingClientRect();
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return hide();
      const ratio = scroller.scrollTop / max;
      const thumb = Math.max(24, (scroller.clientHeight * rect.height) / scroller.scrollHeight);
      render(ratio, rect.top + ratio * (rect.height - thumb) + thumb / 2);
    };
    /** ratio: 0(맨 위)~1(맨 아래) 스크롤 위치, anchorY: 카드를 붙일 화면 높이 */
    const render = (ratio: number, anchorY: number) => {
      const rect = scroller.getBoundingClientRect();
      const prose = columnRef.current?.querySelector<HTMLElement>(".note-prose");
      if (!prose) return hide();
      // 스크롤바의 그 자리로 옮겼을 때 화면 위쪽에 오는 글의 위치
      const target = ratio * (scroller.scrollHeight - scroller.clientHeight);
      const docY = (el: Element) => el.getBoundingClientRect().top - rect.top + scroller.scrollTop;
      const blocks = Array.from(prose.children) as HTMLElement[];
      if (blocks.length === 0) return hide();
      let start = blocks.findIndex((block) => docY(block) + block.offsetHeight > target);
      if (start === -1) start = blocks.length - 1;

      if (last.current?.start !== start) {
        const sliceTop = docY(blocks[start]!);
        const parts: string[] = [];
        for (let i = start; i < blocks.length && docY(blocks[i]!) < sliceTop + SLICE_HEIGHT; i++) {
          const clone = blocks[i]!.cloneNode(true) as HTMLElement;
          clone.removeAttribute("contenteditable");
          clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
          parts.push(clone.outerHTML);
        }
        let heading = "";
        for (let i = start; i >= 0; i--) {
          if (/^H[1-3]$/.test(blocks[i]!.tagName)) {
            heading = blocks[i]!.textContent?.trim() ?? "";
            break;
          }
        }
        last.current = { start, html: parts.join(""), heading };
      }
      const width = prose.clientWidth || 600;
      setPeek({
        y: Math.min(window.innerHeight - CARD_BODY_HEIGHT - 60, Math.max(8, anchorY - (CARD_BODY_HEIGHT + 30) / 2)),
        right: window.innerWidth - rect.right + BAR_ZONE + 6,
        start,
        html: last.current.html,
        heading: last.current.heading,
        percent: Math.round(ratio * 100),
        zoom: (CARD_WIDTH - 24) / width,
        width,
      });
    };
    const onMove = (event: MouseEvent) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      const { clientX, clientY } = event;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        update(clientX, clientY);
      });
    };
    const onScrollFrame = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        onScroll();
      });
    };
    // 스크롤바를 누른 채 끄는 동안 칸 밖으로 나가도 닫지 않는다.
    const onLeave = (event: MouseEvent) => {
      if (event.buttons & 1) return;
      active.current = false;
      hide();
    };
    // 끌기를 마친 자리가 스크롤바 밖이면 닫는다.
    const onUp = (event: MouseEvent) => {
      if (!active.current) return;
      const rect = scroller.getBoundingClientRect();
      if (event.clientX < rect.right - BAR_ZONE || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        active.current = false;
        hide();
      }
    };
    scroller.addEventListener("mousemove", onMove);
    scroller.addEventListener("mouseleave", onLeave);
    scroller.addEventListener("scroll", onScrollFrame, { passive: true });
    window.addEventListener("mouseup", onUp);
    return () => {
      scroller.removeEventListener("mousemove", onMove);
      scroller.removeEventListener("mouseleave", onLeave);
      scroller.removeEventListener("scroll", onScrollFrame);
      window.removeEventListener("mouseup", onUp);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [columnRef]);

  if (!peek) return null;
  return createPortal(
    <div
      role="tooltip"
      aria-label="이 위치 미리보기"
      style={{ top: peek.y, right: peek.right, width: CARD_WIDTH }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl"
    >
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{peek.heading || "글 처음"}</span>
        <span className="shrink-0 tabular-nums">{peek.percent}%</span>
      </div>
      <div className="overflow-hidden px-3 pt-2 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]" style={{ height: CARD_BODY_HEIGHT }}>
        <div className="note-prose" style={{ width: peek.width, zoom: peek.zoom }} dangerouslySetInnerHTML={{ __html: peek.html }} />
      </div>
    </div>,
    document.body,
  );
}
