import type { DocBlock, DocImage, DocInline, DocModel, DocText } from "@shared/docx-model";

/** A4 본문 폭에 들어가는 그림 최대 너비 (px, 96dpi 기준) */
export const MAX_IMAGE_WIDTH = 600;

type Marks = Omit<DocText, "type" | "text">;

const SAFE_LINK = /^(https?:|mailto:)/i;

interface Walker {
  blocks: DocBlock[];
  footnotes: Record<number, DocInline[]>;
  /** 각주 이름(화면 번호) → Word 각주 번호 */
  footnoteIds: Map<string, number>;
  images: DocImage[];
  nextList: number;
}

function footnoteId(walker: Walker, label: string) {
  let id = walker.footnoteIds.get(label);
  if (id === undefined) {
    id = walker.footnoteIds.size + 1;
    walker.footnoteIds.set(label, id);
  }
  return id;
}

/** 문단 안의 글자, 서식, 링크, 그림, 각주 표시를 차례로 모은다. */
function inlines(walker: Walker, node: Node, marks: Marks = {}, out: DocInline[] = []): DocInline[] {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push({ type: "text", text, ...marks });
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === "br") out.push({ type: "break" });
    else if (tag === "img") {
      const image: DocImage = {
        type: "image",
        src: child.getAttribute("src") ?? "",
        width: Number(child.getAttribute("width")) || 0,
        height: Number(child.getAttribute("height")) || 0,
        alt: child.getAttribute("alt") ?? "",
      };
      if (image.src) {
        walker.images.push(image);
        out.push(image);
      }
    } else if (tag === "sup" && child.classList.contains("footnote-ref")) {
      out.push({ type: "footnote", id: footnoteId(walker, child.dataset["footnote"] ?? child.textContent ?? "") });
    } else if (tag === "strong" || tag === "b") inlines(walker, child, { ...marks, bold: true }, out);
    else if (tag === "em" || tag === "i") inlines(walker, child, { ...marks, italic: true }, out);
    else if (tag === "s" || tag === "del" || tag === "strike") inlines(walker, child, { ...marks, strike: true }, out);
    else if (tag === "code") inlines(walker, child, { ...marks, code: true }, out);
    else if (tag === "a") {
      const href = child.getAttribute("href") ?? "";
      inlines(walker, child, SAFE_LINK.test(href) ? { ...marks, link: href } : marks, out);
    } else if (tag === "input") {
      // 할 일 체크 상자는 목록 항목에서 따로 다룬다.
    } else inlines(walker, child, marks, out);
  }
  return out;
}

/** 앞뒤 공백을 걷어 낸다 (HTML 줄바꿈이 글자로 남지 않게). */
function trim(items: DocInline[]) {
  const first = items[0];
  if (first?.type === "text") first.text = first.text.trimStart();
  const last = items.at(-1);
  if (last?.type === "text") last.text = last.text.trimEnd();
  return items.filter((item) => item.type !== "text" || item.text);
}

function list(walker: Walker, el: HTMLElement, level: number, quote: number) {
  const ordered = el.tagName === "OL" ? walker.nextList++ : null;
  const task = el.dataset["type"] === "taskList";
  for (const li of el.children) {
    if (!(li instanceof HTMLElement) || li.tagName !== "LI") continue;
    const checked = task ? li.dataset["checked"] === "true" : null;
    // 항목의 첫 문단은 목록 줄로, 그 뒤의 하위 목록과 문단은 한 단계 안쪽으로.
    const content = task ? (li.querySelector(":scope > div") ?? li) : li;
    let first = true;
    for (const child of content.childNodes) {
      if (child instanceof HTMLElement && (child.tagName === "UL" || child.tagName === "OL")) {
        list(walker, child, level + 1, quote);
        continue;
      }
      if (child instanceof HTMLElement && child.tagName === "LABEL") continue;
      const children = trim(child instanceof HTMLElement && child.tagName === "P" ? inlines(walker, child) : inlines(walker, wrap(child)));
      if (children.length === 0) continue;
      if (first) walker.blocks.push({ type: "list-item", ordered, level, checked, children, ...(quote ? { quote } : {}) });
      else walker.blocks.push({ type: "list-item", ordered: null, level: level + 1, checked: null, children, ...(quote ? { quote } : {}) });
      first = false;
    }
  }
}

function wrap(node: ChildNode) {
  const span = document.createElement("span");
  span.append(node.cloneNode(true));
  return span;
}

function paragraph(walker: Walker, el: Node, quote: number, role?: "caption" | "callout-title") {
  const children = trim(inlines(walker, el));
  if (children.length === 0) return;
  walker.blocks.push({ type: "paragraph", children, ...(quote ? { quote } : {}), ...(role ? { role } : {}) });
}

function blocks(walker: Walker, parent: Element, quote = 0) {
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) paragraph(walker, wrap(node), quote);
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const tag = node.tagName.toLowerCase();
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      const children = trim(inlines(walker, node));
      if (children.length > 0) walker.blocks.push({ type: "heading", level: Number(heading[1]) as 1, children });
    } else if (tag === "p") paragraph(walker, node, quote, node.classList.contains("caption") ? "caption" : undefined);
    else if (tag === "ul" || tag === "ol") list(walker, node, 0, quote);
    else if (tag === "pre") walker.blocks.push({ type: "code", text: (node.textContent ?? "").replace(/\n$/, ""), ...(quote ? { quote } : {}) });
    else if (tag === "hr") walker.blocks.push({ type: "rule" });
    else if (tag === "blockquote") blocks(walker, node, quote + 1);
    else if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map((tr) => ({
        header: [...tr.children].every((cell) => cell.tagName === "TH"),
        cells: [...tr.children].map((cell) => {
          // 칸 안의 문단 사이는 줄바꿈으로 잇는다.
          const parts = [...cell.children].length > 0 && [...cell.children].every((c) => c.tagName === "P") ? [...cell.children] : [cell];
          return parts.flatMap((part, i) => [...(i > 0 ? [{ type: "break" as const }] : []), ...trim(inlines(walker, part))]);
        }),
      }));
      walker.blocks.push({ type: "table", rows });
    } else if (node.classList.contains("footnote-def")) {
      const id = footnoteId(walker, node.dataset["footnote"] ?? "");
      const body = node.querySelector(".footnote-body") ?? node;
      walker.footnotes[id] = trim(inlines(walker, body));
    } else if (node.classList.contains("callout") || node.classList.contains("template-block")) {
      const title = node.querySelector(":scope > .callout-title, :scope > .template-block-header");
      if (title) paragraph(walker, title, quote + 1, "callout-title");
      const body = node.querySelector(":scope > .callout-body, :scope > .template-block-body");
      blocks(walker, body ?? node, quote + 1);
    } else if (tag === "div" || tag === "section" || tag === "figure" || tag === "main") blocks(walker, node, quote);
    else paragraph(walker, wrap(node), quote);
  }
}

/** 크기를 정하지 않은 그림은 실제 크기를 읽고, 본문 폭보다 크면 비율대로 줄인다. */
async function measure(images: DocImage[], load: (src: string) => Promise<{ width: number; height: number } | null>) {
  await Promise.all(
    images.map(async (image) => {
      if (!image.width || !image.height) {
        const size = await load(image.src).catch(() => null);
        if (size && size.width > 0 && size.height > 0) {
          if (image.width) image.height = Math.round((image.width / size.width) * size.height);
          else if (image.height) image.width = Math.round((image.height / size.height) * size.width);
          else Object.assign(image, size);
        }
      }
      if (image.width > MAX_IMAGE_WIDTH) {
        image.height = Math.round((image.height * MAX_IMAGE_WIDTH) / image.width);
        image.width = MAX_IMAGE_WIDTH;
      }
    }),
  );
}

function naturalSize(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 내보내기용 본문 HTML을 Word 문서 모양으로 바꾼다. */
export async function htmlToDocModel(title: string, html: string, load = naturalSize): Promise<DocModel> {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker: Walker = { blocks: [], footnotes: {}, footnoteIds: new Map(), images: [], nextList: 1 };
  blocks(walker, doc.body);
  await measure(walker.images, load);
  // 내용 줄이 없는 각주도 표시가 가리킬 곳이 있게 빈 각주를 만든다.
  for (const id of walker.footnoteIds.values()) walker.footnotes[id] ??= [{ type: "text", text: "" }];
  return { title, blocks: walker.blocks, footnotes: walker.footnotes };
}
