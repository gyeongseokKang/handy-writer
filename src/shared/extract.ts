/** 링크에서 글 가져오기: 웹 페이지의 본문(또는 유튜브 영상의 설명·자막)을 뽑아 새 글로 만든다. */

export interface ExtractResult {
  url: string;
  title: string;
  /** 사이트 이름 (예: 브런치, YouTube) */
  siteName: string;
  /** 글쓴이 (없으면 빈 문자열) */
  byline: string;
  /** 본문 HTML. 화면에서 마크다운으로 바꾼다 (에디터가 아는 요소만 남는다). */
  html: string;
}

/** 본문 HTML의 최대 크기. 이보다 크면 잘라서 가져온다. */
export const MAX_EXTRACT_HTML = 2_000_000;

/** http(s) 주소만 받는다. 앞뒤 공백과 꺾쇠(<…>)는 벗긴다. 아니면 null */
export function normalizeExtractUrl(input: string): string | null {
  const trimmed = input.trim().replace(/^<|>$/g, "");
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 줄글을 문단 HTML로 (빈 줄로 문단을 나누고, 한 문단 안의 줄바꿈은 공백으로) */
export function textToParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

/** 새 글 맨 위에 붙이는 frontmatter. 원래 주소와 가져온 날짜를 남긴다. */
export function extractFrontmatter(result: Pick<ExtractResult, "url" | "byline">, now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const quote = (value: string) => JSON.stringify(value);
  const lines = [`source: ${quote(result.url)}`, ...(result.byline ? [`author: ${quote(result.byline)}`] : []), `extracted: ${date}`];
  return `---\n${lines.join("\n")}\n---\n`;
}

/** "글 제목 | 사이트 이름"처럼 뒤에 붙은 사이트 이름을 뗀다. 떼고 남는 제목이 너무 짧으면 그대로 둔다. */
export function cleanTitle(title: string, siteName = ""): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  const match = /^(.*\S)\s+(?:[|·•»–—]|-|::)\s+([^|·•»–—]+)$/.exec(trimmed);
  if (!match) return trimmed;
  const [, head = "", tail = ""] = match;
  const site = siteName.trim().toLowerCase();
  const looksLikeSite = (site && (tail.toLowerCase().includes(site) || site.includes(tail.toLowerCase()))) || tail.length <= 30;
  return looksLikeSite && head.length >= 4 ? head : trimmed;
}
