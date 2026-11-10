import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  /** 스크롤바 위에 까는 투명한 레일 (누르면 그 자리로 바로 가고, 끌면 따라간다) */
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [railBox, setRailBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const frame = useRef<number | null>(null);
  const last = useRef<{ start: number; html: string; heading: string } | null>(null);

  useEffect(() => {
    const scroller = columnRef.current?.closest<HTMLElement>("[data-note-scroller]");
    if (!scroller) return;
    const hide = () => {
      last.current = null;
      setPeek(null);
    };
    /** 레일에 마우스가 있거나 끄는 중인지. 휠로 스크롤하면 미리보기가 따라간다. */
    const active = { current: false };
    const dragging = { current: false };
    const ratioAt = (clientY: number) => {
      const rect = scroller.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    };
    const update = (clientY: number) => {
      if (scroller.scrollHeight <= scroller.clientHeight + 1) return hide();
      active.current = true;
      render(ratioAt(clientY), clientY);
    };
    /** 누른 높이로 바로 간다: 미리보기에 보이던 부분이 화면 맨 위에 온다. */
    const jump = (clientY: number) => {
      const ratio = ratioAt(clientY);
      scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);
      active.current = true;
      render(ratio, clientY);
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
        right: window.innerWidth - rect.right + Math.max(12, scroller.offsetWidth - scroller.clientWidth) + 8,
        start,
        html: last.current.html,
        heading: last.current.heading,
        percent: Math.round(ratio * 100),
        zoom: (CARD_WIDTH - 24) / width,
        width,
      });
    };
    const later = (fn: () => void) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        fn();
      });
    };
    const onScrollFrame = () => {
      if (!dragging.current) later(onScroll);
    };
    scroller.addEventListener("scroll", onScrollFrame, { passive: true });

    const cleanups: (() => void)[] = [];
    if (rail) {
      const onDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        rail.setPointerCapture(event.pointerId);
        dragging.current = true;
        jump(event.clientY);
      };
      const onMove = (event: PointerEvent) => {
        const y = event.clientY;
        later(() => (dragging.current ? jump(y) : update(y)));
      };
      const onUp = (event: PointerEvent) => {
        dragging.current = false;
        if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
        const r = rail.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
          active.current = false;
          hide();
        }
      };
      const onLeave = () => {
        if (dragging.current) return;
        active.current = false;
        hide();
      };
      // 레일 위에서 굴린 휠은 글을 스크롤한다 (미리보기는 스크롤을 따라간다).
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        scroller.scrollBy({ top: event.deltaY });
      };
      rail.addEventListener("pointerdown", onDown);
      rail.addEventListener("pointermove", onMove);
      rail.addEventListener("pointerup", onUp);
      rail.addEventListener("pointercancel", onUp);
      rail.addEventListener("pointerleave", onLeave);
      rail.addEventListener("wheel", onWheel, { passive: false });
      cleanups.push(() => {
        rail.removeEventListener("pointerdown", onDown);
        rail.removeEventListener("pointermove", onMove);
        rail.removeEventListener("pointerup", onUp);
        rail.removeEventListener("pointercancel", onUp);
        rail.removeEventListener("pointerleave", onLeave);
        rail.removeEventListener("wheel", onWheel);
      });
    }

    // 레일을 스크롤바 자리에 맞춘다 (창·칸 크기가 바뀌면 다시).
    const place = () => {
      const rect = scroller.getBoundingClientRect();
      if (scroller.scrollHeight <= scroller.clientHeight + 1) return setRailBox(null);
      const width = Math.max(12, scroller.offsetWidth - scroller.clientWidth);
      setRailBox((prev) => (prev && prev.left === rect.right - width && prev.top === rect.top && prev.width === width && prev.height === rect.height ? prev : { left: rect.right - width, top: rect.top, width, height: rect.height }));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(scroller);
    if (columnRef.current) observer.observe(columnRef.current);
    window.addEventListener("resize", place);
    return () => {
      scroller.removeEventListener("scroll", onScrollFrame);
      cleanups.forEach((fn) => fn());
      observer.disconnect();
      window.removeEventListener("resize", place);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [columnRef, rail]);

  return createPortal(
    <>
      {railBox && (
        <div
          ref={setRail}
          aria-hidden
          data-testid="scroll-rail"
          title="누르면 그 위치로 가요 · 끌어서 이동"
          style={railBox}
          className="fixed z-20 cursor-pointer"
        />
      )}
      {peek && (
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
    </div>
      )}
    </>,
    document.body,
  );
}
