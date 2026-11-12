import { api } from "@/shared/api/handy-api";

/** 글 칸 위쪽에 떠 있는 목차 칩 등에 가리지 않도록 비워 두는 높이 */
const TOP_GAP = 72;
const BOTTOM_GAP = 16;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("찍은 화면을 읽지 못했어요."));
    image.src = src;
  });
}

/**
 * 요소를 화면에 보이는 그대로 찍어 PNG data URL로 돌려준다.
 * 글 칸보다 길면 글 칸을 조금씩 스크롤하며 나눠 찍어 이어 붙이고, 끝나면 스크롤을 되돌린다.
 * 찍는 동안 <html>에 `capturing` 클래스를 붙여 버튼처럼 찍히면 안 되는 것을 숨긴다.
 */
export async function captureElement(element: HTMLElement): Promise<string> {
  const scroller = element.closest<HTMLElement>("[data-note-scroller]");
  const savedTop = scroller?.scrollTop ?? 0;
  const root = document.documentElement;
  root.classList.add("capturing");
  (document.activeElement as HTMLElement | null)?.blur?.();
  try {
    await nextFrame();
    const { width, height } = element.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("그림을 만들지 못했어요.");

    const box = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const segment = Math.max(80, Math.floor(box.bottom - box.top - TOP_GAP - BOTTOM_GAP));
    for (let offset = 0; offset < height; offset += segment) {
      const part = Math.min(segment, height - offset);
      if (scroller) {
        // 이번 조각의 윗줄이 글 칸 위쪽(목차 칩 아래)에 오게 스크롤한다.
        scroller.scrollTop += element.getBoundingClientRect().top + offset - (box.top + TOP_GAP);
        await nextFrame();
      }
      const rect = element.getBoundingClientRect();
      const top = rect.top + offset;
      const shot = await api.export.capture({ x: rect.left, y: top, width: rect.width, height: part });
      const image = await loadImage(shot);
      context.drawImage(image, 0, Math.round(offset * scale), canvas.width, Math.round(part * scale));
    }
    return canvas.toDataURL("image/png");
  } finally {
    if (scroller) scroller.scrollTop = savedTop;
    root.classList.remove("capturing");
  }
}
