import { DOCUMENT_CSS, PAGE_MARGIN_MM, PRINT_FONT_PT, PRINT_LINE_HEIGHT } from "@shared/export";

/**
 * A4로 뽑았을 때 몇 쪽(p)인지 센다. PDF 내보내기와 같은 문서를 같은 쪽 크기(A4, 사방 여백, 10pt 글자)로
 * 보이지 않게 그려 보고, 쪽이 넘어가는 자리를 에디터 화면의 높이로 옮긴다.
 */

const MM = 96 / 25.4;
/** A4 본문 칸 크기 (px, 96dpi) */
export const A4_CONTENT_WIDTH = (210 - PAGE_MARGIN_MM * 2) * MM;
export const A4_CONTENT_HEIGHT = (297 - PAGE_MARGIN_MM * 2) * MM;
/** 인쇄할 때 `html { font-size: 10pt }`라서 rem 하나가 이만큼이다 (px) */
const REM_PX = (PRINT_FONT_PT * 96) / 72;

export interface PageBreak {
  /** 이 구분선 아래에서 시작하는 쪽 번호 (2부터) */
  page: number;
  /** 에디터 본문(.ProseMirror) 맨 위에서 잰 화면 높이 (px) */
  y: number;
}

export interface PageEstimate {
  pages: number;
  breaks: PageBreak[];
}

/** 블록 하나의 A4에서의 위치와 화면에서의 위치 */
export interface BlockBox {
  a4Top: number;
  a4Height: number;
  top: number;
  height: number;
  /** 쪽 사이에서 나뉠 수 있는 글 블록인지 (그림·표·코드는 통째로 다음 쪽으로 넘긴다) */
  splittable: boolean;
  /** 화면에서의 한 줄 높이 */
  lineHeight?: number;
  /** A4 문서에서의 한 줄 높이. 주면 쪽을 줄 경계에서 나누고, 문단 첫·끝 두 줄이 홀로 남지 않게 한다 (인쇄 규칙). */
  a4LineHeight?: number;
}

/**
 * 블록 위치로 쪽 수와 나뉘는 자리를 셈한다.
 * 쪽 경계가 글 블록 가운데를 지나면 그 비율대로 화면 위치를 정하고, 나눌 수 없는 블록이면 그 블록을 다음 쪽으로 넘긴다.
 */
export function paginate(blocks: BlockBox[], pageHeight = A4_CONTENT_HEIGHT, offset = 0): PageEstimate {
  const last = blocks.at(-1);
  if (!last) return { pages: 0, breaks: [] };
  const breaks: PageBreak[] = [];
  // shift: 블록을 다음 쪽으로 넘기거나 쪽 끝에 남긴 빈 자리만큼 뒤 블록이 밀린다.
  let shift = 0;
  let page = 1;
  for (const block of blocks) {
    let top = block.a4Top + offset + shift;
    // 이 블록에서 앞 쪽에 이미 들어간 높이
    let placed = 0;
    while (top + block.a4Height > page * pageHeight) {
      const boundary = page * pageHeight;
      page++;
      if (top + placed >= boundary) {
        // 블록 앞의 여백에서 쪽이 넘어간다.
        breaks.push({ page, y: block.top });
        continue;
      }
      let fit = boundary - top;
      const line = block.a4LineHeight;
      if (!block.splittable && block.a4Height <= pageHeight) fit = 0;
      else if (line) {
        const total = Math.round(block.a4Height / line);
        let lines = Math.floor(fit / line + 1e-6);
        // 문단의 첫 두 줄, 끝 두 줄은 홀로 남기지 않는다 (orphans, widows).
        if (lines < 2) lines = 0;
        else if (total - lines < 2) lines = Math.max(0, total - 2);
        fit = lines * line;
      }
      const screenOffset = line && block.lineHeight ? Math.round(fit / line) * block.lineHeight : (fit / block.a4Height) * block.height;
      breaks.push({ page, y: block.top + screenOffset });
      // 쪽 끝에 남은 빈 자리만큼 블록의 나머지가 밀린다.
      const waste = boundary - (top + fit);
      shift += waste;
      top += waste;
      placed = fit;
    }
  }
  const end = last.a4Top + last.a4Height + offset + shift;
  return { pages: Math.max(1, Math.ceil(end / pageHeight - 1e-6)), breaks };
}

const UNSPLITTABLE = new Set(["TABLE", "PRE", "IMG", "FIGURE", "HR", "VIDEO", "BLOCKQUOTE"]);

function isSplittable(el: Element) {
  if (UNSPLITTABLE.has(el.tagName) || el.classList.contains("callout") || el.classList.contains("template-block")) return false;
  // 그림 하나만 든 문단은 나눌 수 없다.
  if (el.tagName === "P" && el.querySelector("img, video") && !el.textContent?.trim()) return false;
  return true;
}

/**
 * 내보낼 PDF와 같은 문서(제목·본문·같은 CSS)를 A4 본문 폭의 보이지 않는 칸에 그린다.
 * iframe은 키보드 포커스를 가져갈 수 있어서 shadow DOM에 그리고, 문서 CSS의 body·main 규칙을 칸에 옮긴다.
 */
async function renderHidden(title: string, bodyHtml: string) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${A4_CONTENT_WIDTH}px;visibility:hidden;pointer-events:none;contain:layout style`;
  const shadow = host.attachShadow({ mode: "open" });
  // 인쇄 CSS가 하는 일(rem을 10pt 기준으로, 본문 10pt·줄 간격 160%, 여백 없음)을 칸 안에서 똑같이 한다.
  const css = DOCUMENT_CSS.replace(/(^|\n)body \{/, "$1.page {")
    .replace(/:root \{[^}]*\}/, "")
    .replace(/(\d*\.?\d+)rem/g, (_all, n: string) => `${Number(n) * REM_PX}px`);
  shadow.innerHTML = `<style>${css}.page{font-size:${REM_PX}px;line-height:${PRINT_LINE_HEIGHT}}.page main{max-width:none;margin:0;padding:0}</style><div class="page"><main></main></div>`;
  const main = shadow.querySelector("main")!;
  const heading = document.createElement("h1");
  heading.className = "title";
  heading.textContent = title;
  main.append(heading);
  main.insertAdjacentHTML("beforeend", bodyHtml);
  document.body.append(host);
  // 그림은 다 불러온 뒤에 잰다 (크기를 정하지 않은 그림의 높이).
  await Promise.all([...main.querySelectorAll("img")].map((img) => (img.complete ? null : img.decode().catch(() => null))));
  return { host, main };
}

/**
 * 내보낼 PDF와 같은 문서를 A4 본문 폭으로 그려서 블록마다 높이를 재고, 에디터 화면의 같은 블록 위치로 옮긴다.
 * bodyHtml은 내보내기용 본문 HTML(toExportHtml)
 */
export async function measurePages(dom: HTMLElement, title: string, bodyHtml: string): Promise<PageEstimate> {
  if (!dom.textContent?.trim() && !dom.querySelector("img, video, table, hr")) return { pages: 0, breaks: [] };
  const { host, main } = await renderHidden(title, bodyHtml);
  try {
    const copies = [...main.children].slice(1);
    const originals = ([...dom.children] as HTMLElement[]).filter((el) => !el.classList.contains("ProseMirror-gapcursor") && !el.classList.contains("ProseMirror-trailingBreak") && !el.classList.contains("title-echo"));
    const a4Base = main.getBoundingClientRect().top;
    const screenBase = dom.getBoundingClientRect().top;
    const blocks: BlockBox[] = [];
    for (const [i, copy] of copies.entries()) {
      const a4 = copy.getBoundingClientRect();
      const original = originals[Math.min(i, originals.length - 1)];
      if (!original) break;
      const screen = original.getBoundingClientRect();
      const lineHeight = Number.parseFloat(getComputedStyle(original).lineHeight) || undefined;
      const a4LineHeight = Number.parseFloat(getComputedStyle(copy).lineHeight) || undefined;
      // 화면과 블록 수가 어긋나면(드문 경우) 뒤쪽 블록은 화면의 마지막 블록 끝에 맞춘다.
      const matched = i < originals.length;
      blocks.push({
        a4Top: a4.top - a4Base,
        a4Height: a4.height,
        top: matched ? screen.top - screenBase : screen.bottom - screenBase,
        height: matched ? screen.height : 0,
        splittable: isSplittable(copy),
        // 줄 높이가 같은 글 블록(문단·제목)만 줄 단위로 나눈다. 목록처럼 안에 여러 블록이 든 것은 비율로 나눈다.
        ...(copy.tagName === "P" || /^H[1-6]$/.test(copy.tagName) ? { lineHeight, a4LineHeight } : {}),
      });
    }
    // 첫 블록 위의 제목도 첫 쪽을 차지하므로 블록 위치는 문서 맨 위에서 잰 그대로 쓴다.
    return paginate(blocks);
  } finally {
    host.remove();
  }
}
