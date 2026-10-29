import { labelName, refId, type LabelInfo } from "./cross-ref";
import { assetUrl, isRemoteUrl, kindOfPath, resolveAttachment, type AttachmentMeta } from "@shared/attachments";

export interface ExportContext {
  attachments: AttachmentMeta[];
  /** 글이 있는 폴더 (임베드 대상을 찾는 기준) */
  noteFolder: string;
  /** 각주 이름 → 화면에 보이는 번호 */
  footnotes?: Map<string, number>;
  /** 블록 ID → 그림·표 번호 */
  labels?: Map<string, Pick<LabelInfo, "id" | "kind" | "number">>;
}

const KIND_LABEL = { video: "영상", audio: "오디오", pdf: "PDF", image: "이미지", other: "첨부" } as const;

function sizeAttrs(el: HTMLElement, node: HTMLElement) {
  const width = el.getAttribute("data-width");
  const height = el.getAttribute("data-height");
  if (width) node.setAttribute("width", width);
  if (height) node.setAttribute("height", height);
}

/** 임베드 하나를 문서에서 보이는 모양으로 바꾼다. 이미지만 그림으로 넣고, 영상·오디오·PDF는 이름만 남긴다. */
function renderEmbed(doc: Document, el: HTMLElement, ctx: ExportContext): Node {
  const target = el.getAttribute("data-embed") ?? "";
  const label = el.getAttribute("data-label") ?? "";
  const remote = isRemoteUrl(target);
  const meta = remote ? null : resolveAttachment(ctx.attachments, target, ctx.noteFolder);
  const kind = remote ? kindOfPath(target) : (meta?.kind ?? kindOfPath(target));
  const url = remote ? target : meta ? assetUrl(meta.path) : "";

  if (kind === "image" && url) {
    const img = doc.createElement("img");
    img.src = url;
    img.alt = label || target;
    sizeAttrs(el, img);
    return img;
  }
  if (kind === "video" && remote) {
    const video = doc.createElement("video");
    video.src = url;
    video.controls = true;
    sizeAttrs(el, video);
    return video;
  }
  if (kind === "audio" && remote) {
    const audio = doc.createElement("audio");
    audio.src = url;
    audio.controls = true;
    return audio;
  }
  // 다른 글을 가져온 임베드, 없는 파일, 파일로 옮길 수 없는 첨부는 이름만 보여준다.
  const note = doc.createElement("span");
  note.className = "attachment";
  note.textContent = kind === "other" ? `[[${target}]]` : `[${KIND_LABEL[kind]}: ${label || target}]`;
  return note;
}

/**
 * 에디터의 HTML을 내보내기용 본문으로 바꾼다.
 * 임베드를 실제 그림이나 이름으로 풀고, 편집용 속성을 걷어낸다.
 * 작업 폴더 이미지는 `handy-asset://` 주소로 두면 메인 프로세스가 파일에 직접 넣는다.
 */
export function toExportHtml(editorHtml: string, ctx: ExportContext) {
  const doc = new DOMParser().parseFromString(`<body>${editorHtml}</body>`, "text/html");

  for (const el of doc.body.querySelectorAll<HTMLElement>("[data-embed]")) el.replaceWith(renderEmbed(doc, el, ctx));
  for (const el of doc.body.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) el.disabled = true;
  for (const el of doc.body.querySelectorAll("[contenteditable]")) el.removeAttribute("contenteditable");
  numberFootnotes(doc, ctx.footnotes);
  numberLabels(doc, ctx.labels);
  return doc.body.innerHTML;
}

/** 각주 표시와 내용 줄의 이름을 화면과 같은 번호로 바꾼다. */
function numberFootnotes(doc: Document, numbers: ExportContext["footnotes"]) {
  if (!numbers) return;
  for (const el of doc.body.querySelectorAll<HTMLElement>("sup[data-footnote], .footnote-def .footnote-label")) {
    const label = el.closest<HTMLElement>("[data-footnote]")?.dataset["footnote"] ?? "";
    const number = numbers.get(label);
    if (number !== undefined) el.textContent = String(number);
  }
}

/** 캡션 문단에서 `^id`를 떼고 "그림 1."을 붙이며, `[[#^id]]` 참조는 그 캡션으로 가는 "그림 1" 링크로 바꾼다. */
function numberLabels(doc: Document, labels: ExportContext["labels"]) {
  if (!labels) return;
  for (const p of doc.body.querySelectorAll("p")) {
    const last = [...p.childNodes].reverse().find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    const match = last?.textContent ? /(^|\s+)\^([A-Za-z0-9][\w-]*)\s*$/.exec(last.textContent) : null;
    const info = match ? labels.get(match[2] ?? "") : undefined;
    if (!last || !match || !info) continue;
    last.textContent = last.textContent!.slice(0, match.index);
    p.id = info.id;
    if (info.kind === "other") continue;
    p.classList.add("caption");
    const label = doc.createElement("strong");
    label.className = "caption-label";
    label.textContent = `${labelName(info)}. `;
    p.prepend(label);
  }
  for (const el of doc.body.querySelectorAll<HTMLElement>("[data-wikilink]")) {
    const id = refId(el.dataset["wikilink"] ?? "");
    const info = id === null ? undefined : labels.get(id);
    if (!info) continue;
    const link = doc.createElement("a");
    link.href = `#${info.id}`;
    link.className = "xref";
    link.textContent = labelName(info);
    el.replaceWith(link);
  }
}

/** 붙여 넣는 곳(블로그·메일 편집기)은 <style>을 버리므로, 모양이 깨지기 쉬운 요소에만 style 속성을 직접 넣는다. */
const PASTE_STYLES: Record<string, string> = {
  table: "border-collapse:collapse;",
  "th, td": "border:1px solid #d0d7de;padding:4px 8px;vertical-align:top;",
  th: "background:#f6f8fa;",
  pre: "background:#f6f8fa;border-radius:6px;padding:12px;white-space:pre-wrap;",
  ":not(pre) > code": "background:#f3f4f6;border-radius:4px;padding:1px 4px;font-family:monospace;",
  blockquote: "border-left:3px solid #d0d7de;margin-left:0;padding-left:12px;color:#57606a;",
  ".callout, .template-block": "border-left:4px solid #3b82f6;background:#eff6ff;padding:8px 12px;margin:8px 0;",
  ".callout-title, .template-block-header": "font-weight:bold;",
  img: "max-width:100%;",
};

export function withPasteStyles(html: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const [selector, style] of Object.entries(PASTE_STYLES)) {
    for (const el of doc.body.querySelectorAll<HTMLElement>(selector)) el.setAttribute("style", `${el.getAttribute("style") ?? ""}${style}`);
  }
  return doc.body.innerHTML;
}
