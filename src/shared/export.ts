import { ASSET_SCHEME } from "./attachments";

export type ExportFormat = "md" | "html" | "pdf" | "docx";

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; extension: string }> = {
  md: { label: "마크다운 (.md)", extension: "md" },
  html: { label: "웹 문서 (.html)", extension: "html" },
  pdf: { label: "PDF (.pdf)", extension: "pdf" },
  docx: { label: "Word (.docx)", extension: "docx" },
};

export interface ExportRequest {
  /** 글 제목 (저장 창의 기본 파일 이름과 문서 제목) */
  name: string;
  format: ExportFormat;
  /** md면 파일에 쓸 마크다운 전체, html과 pdf면 본문 HTML, docx면 글 모양(DocModel)의 JSON */
  content: string;
  /** PDF·Word의 쪽 설정 (없으면 기본값) */
  layout?: PageOptions;
}

export interface ExportResult {
  /** 저장한 파일의 절대 경로. 저장 창에서 취소하면 null */
  path: string | null;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 인쇄(PDF)할 때의 쪽 기준. 한글·Word의 기본값(10pt, 줄 간격 160%)에 여백 20mm라서
 * A4 한 쪽에 2,000자쯤(200자 원고지 10매) 들어간다. 화면으로 보는 HTML은 읽기 편한 16px 그대로다.
 */
export const PRINT_FONT_PT = 10;
export const PRINT_LINE_HEIGHT = 1.6;
export const PAGE_MARGIN_MM = 20;

/** 종이 크기 (mm) */
export const PAPERS = {
  A4: { label: "A4", width: 210, height: 297 },
  A5: { label: "A5", width: 148, height: 210 },
  B5: { label: "B5", width: 176, height: 250 },
  Letter: { label: "Letter", width: 216, height: 279 },
} as const;
export type PaperName = keyof typeof PAPERS;

export type PageNumbers = "none" | "number" | "of-total";

/** PDF·Word로 내보낼 때 고르는 쪽 설정 */
export interface PageOptions {
  paper: PaperName;
  /** 본문 글자 크기 (pt) */
  fontPt: number;
  /** 줄 간격 (글자 크기의 배수) */
  lineHeight: number;
  /** 왼쪽·오른쪽 여백 (mm) */
  marginX: number;
  /** 위·아래 여백 (mm) */
  marginY: number;
  /** 쪽 아래에 쪽 번호를 넣을지 */
  pageNumbers: PageNumbers;
  /** 맨 위에 글 제목을 크게 넣을지 */
  showTitle: boolean;
}

export const DEFAULT_PAGE_OPTIONS: PageOptions = {
  paper: "A4",
  fontPt: PRINT_FONT_PT,
  lineHeight: PRINT_LINE_HEIGHT,
  marginX: PAGE_MARGIN_MM,
  marginY: PAGE_MARGIN_MM,
  pageNumbers: "none",
  showTitle: true,
};

/** 입력할 수 있는 범위. 벗어나면 가까운 값으로 맞춘다. */
export const PAGE_LIMITS = {
  fontPt: { min: 8, max: 18, step: 0.5 },
  lineHeight: { min: 1.2, max: 2.4, step: 0.1 },
  margin: { min: 5, max: 50, step: 1 },
} as const;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** 저장돼 있던 값이나 바깥에서 온 값을 쓸 수 있는 설정으로 고친다. */
export function normalizePageOptions(raw: unknown): PageOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PAGE_OPTIONS;
  const { fontPt, lineHeight, margin } = PAGE_LIMITS;
  return {
    paper: typeof o.paper === "string" && o.paper in PAPERS ? (o.paper as PaperName) : d.paper,
    fontPt: clamp(o.fontPt, fontPt.min, fontPt.max, d.fontPt),
    lineHeight: Math.round(clamp(o.lineHeight, lineHeight.min, lineHeight.max, d.lineHeight) * 100) / 100,
    marginX: clamp(o.marginX, margin.min, margin.max, d.marginX),
    marginY: clamp(o.marginY, margin.min, margin.max, d.marginY),
    pageNumbers: o.pageNumbers === "number" || o.pageNumbers === "of-total" ? o.pageNumbers : "none",
    showTitle: typeof o.showTitle === "boolean" ? o.showTitle : d.showTitle,
  };
}

/** 내보낸 HTML·PDF 문서의 CSS (쪽 수를 셀 때도 같은 모양으로 그린다) */
const BASE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: #1f2328; font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
h1.title { font-size: 2.25rem; line-height: 1.25; margin: 0 0 1.5rem; }
main > * + * { margin-top: 0.7em; }
h1, h2, h3, h4, h5, h6 { line-height: 1.35; margin-top: 1.4em; }
h1 { font-size: 1.875rem; } h2 { font-size: 1.5rem; } h3 { font-size: 1.25rem; }
ul, ol { padding-left: 1.6rem; }
li > p { margin: 0; }
ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
ul[data-type="taskList"] li { display: flex; gap: 0.5rem; align-items: flex-start; }
ul[data-type="taskList"] li > label { margin-top: 0.4em; }
ul[data-type="taskList"] li > div { flex: 1; }
ul[data-type="taskList"] li[data-checked="true"] > div { color: #6b7280; text-decoration: line-through; }
blockquote { margin-left: 0; border-left: 3px solid #d0d7de; padding-left: 1rem; color: #57606a; }
code { background: #f3f4f6; border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre { background: #f6f8fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.9rem 1rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
pre code { background: none; padding: 0; font-size: 0.85rem; line-height: 1.6; }
hr { border: 0; border-top: 1px solid #d0d7de; margin: 1.6em 0; }
a { color: #0969da; }
img, video { max-width: 100%; height: auto; }
.image-row { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); gap: 0.5rem; align-items: start; break-inside: avoid; }
.image-row img { width: 100%; height: auto; }
.image-row + p.caption { margin-top: 0.4em; }
figure.attachment, p.attachment { color: #57606a; font-size: 0.9rem; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d0d7de; padding: 0.4rem 0.6rem; vertical-align: top; text-align: left; }
th { background: #f6f8fa; }
.callout, .template-block { border-left: 4px solid #3b82f6; background: #eff6ff; border-radius: 4px; padding: 0.6rem 1rem; }
.callout-title, .template-block-header { font-weight: 600; margin-bottom: 0.2rem; }
.callout > .callout-body > * + *, .template-block-body > * + * { margin-top: 0.5em; }
.wikilink, .note-tag { color: #0969da; }
sup.footnote-ref { font-size: 0.75em; color: #0969da; }
sup.footnote-ref::before { content: "["; } sup.footnote-ref::after { content: "]"; }
.footnote-def { display: flex; gap: 0.5rem; font-size: 0.9rem; color: #57606a; }
.footnote-def:not(.footnote-def + .footnote-def) { margin-top: 2rem; padding-top: 0.75rem; border-top: 1px solid #d0d7de; }
.footnote-label { min-width: 1.5rem; color: #0969da; }
.footnote-label::after { content: "."; }
.note-embed > :first-child { margin-top: 0; }
p.caption { text-align: center; font-size: 0.9rem; color: #57606a; }
.caption-label { color: #1f2328; }
a.xref { text-decoration: none; }
`;

/**
 * 인쇄할 때만 바뀌는 규칙: rem이 본문 글자 크기가 되고, 줄 간격을 맞추며, 나누면 안 되는 블록을 지킨다.
 * 쪽 수를 셀 때와 미리 볼 때는 같은 규칙을 @media 없이 쓴다.
 */
export function printRules(options: PageOptions = DEFAULT_PAGE_OPTIONS) {
  return `html { font-size: ${options.fontPt}pt; } body { font-size: 1rem; line-height: ${options.lineHeight}; } main { max-width: none; padding: 0; } pre, table, img, blockquote, .callout, .template-block { break-inside: avoid; } h1, h2, h3, h4 { break-after: avoid; }`;
}

/** 내보낸 HTML·PDF 문서의 CSS (쪽 수를 셀 때도 같은 모양으로 그린다) */
export function documentCss(options: PageOptions = DEFAULT_PAGE_OPTIONS) {
  const paper = PAPERS[options.paper];
  return `${BASE_CSS}@media print { ${printRules(options)} }\n@page { size: ${paper.width}mm ${paper.height}mm; margin: ${options.marginY}mm ${options.marginX}mm; }\n`;
}

/** 기본 설정의 문서 CSS */
export const DOCUMENT_CSS = documentCss();

/** 본문 HTML에 제목과 스타일을 입혀 어디서나 열리는 한 장짜리 문서로 만든다. */
export function buildHtmlDocument(name: string, bodyHtml: string, options: PageOptions = DEFAULT_PAGE_OPTIONS) {
  const title = escapeHtml(name);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${documentCss(options)}</style>
</head>
<body>
<main>
${options.showTitle ? `<h1 class="title">${title}</h1>\n` : ""}${bodyHtml}
</main>
</body>
</html>
`;
}

/** `handy-asset://vault/…` 주소에서 작업 폴더 기준 경로를 꺼낸다. */
export function assetPathOf(url: string) {
  return new URL(url).pathname.split("/").filter(Boolean).map(decodeURIComponent).join("/");
}

const ASSET_SRC = new RegExp(`(\\bsrc=")(${ASSET_SCHEME}://vault/[^"]*)(")`, "g");

/**
 * 본문의 `handy-asset://` 이미지 주소를 data: 주소로 바꿔서 파일 하나로 옮겨 다닐 수 있게 한다.
 * 읽지 못한 파일은 깨진 이미지를 남기지 않고 주소를 비운다.
 */
export async function inlineAssets(html: string, load: (path: string) => Promise<{ mime: string; base64: string } | null>) {
  const cache = new Map<string, Promise<string>>();
  const toDataUrl = (url: string) => {
    let hit = cache.get(url);
    if (!hit) {
      hit = load(assetPathOf(url))
        .catch(() => null)
        .then((file) => (file ? `data:${file.mime};base64,${file.base64}` : ""));
      cache.set(url, hit);
    }
    return hit;
  };

  const urls = [...new Set([...html.matchAll(ASSET_SRC)].map((m) => m[2] as string))];
  const resolved = new Map(await Promise.all(urls.map(async (url) => [url, await toDataUrl(url)] as const)));
  return html.replace(ASSET_SRC, (_all, open: string, url: string, close: string) => `${open}${resolved.get(url) ?? ""}${close}`);
}

/** 저장 창에 처음 보여 줄 파일 이름 (글 제목에서 파일 이름에 못 쓰는 글자를 뺀다). */
export function exportFileName(name: string, format: ExportFormat) {
  const stem = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/\.+$/, "") || "제목 없음";
  return `${stem}.${EXPORT_FORMATS[format].extension}`;
}
