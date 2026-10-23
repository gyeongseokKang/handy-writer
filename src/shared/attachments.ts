export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "other";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "ogv"];
export const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "flac"];

/** 이 확장자만 첨부 파일로 다룬다. 작업 폴더의 다른 파일(코드, 문서 등)은 앱에 노출하지 않는다. */
export const ATTACHMENT_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, "pdf"];

/** 첨부 파일을 복사해 넣는 작업 폴더 안의 폴더 */
export const ATTACHMENT_DIR = "attachments";

export interface AttachmentMeta {
  /** 작업 폴더 기준 상대 경로 (POSIX 구분자) */
  path: string;
  /** 확장자를 포함한 파일 이름 */
  name: string;
  kind: AttachmentKind;
  size: number;
  mtime: number;
}

export function extensionOf(path: string) {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** 원격 주소는 `?w=100`이나 `#page=2` 같은 뒷부분을 떼고 보고, 로컬 파일 이름은 `#`이나 `?`가 들어 있어도 그대로 본다. */
export function kindOfPath(path: string): AttachmentKind {
  const ext = extensionOf(isRemoteUrl(path) ? (path.split(/[?#]/)[0] ?? "") : path);
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "other";
}

export const isAttachmentPath = (path: string) => kindOfPath(path) !== "other";

export const isRemoteUrl = (target: string) => /^https?:\/\//i.test(target);

export interface EmbedParams {
  label: string;
  width: number | null;
  height: number | null;
}

const SIZE_PART = /^(\d+)(?:x(\d+))?$/;

/**
 * `![[파일|라벨|300]]`의 `|` 뒤 조각들에서 라벨과 크기를 읽는다.
 * 마지막 조각이 `300` 또는 `300x200`이면 크기이고, 나머지는 라벨이다 (Obsidian과 같은 규칙).
 */
export function parseEmbedParams(parts: string[]): EmbedParams {
  const trimmed = parts.map((part) => part.trim());
  let width: number | null = null;
  let height: number | null = null;
  const last = trimmed[trimmed.length - 1];
  const size = last === undefined ? null : SIZE_PART.exec(last);
  if (size) {
    width = Number(size[1]);
    height = size[2] ? Number(size[2]) : null;
    trimmed.pop();
  }
  return { label: trimmed.join("|").trim(), width, height };
}

export function formatEmbedParams({ label, width, height }: EmbedParams): string {
  const parts: string[] = [];
  if (label) parts.push(label);
  if (width) parts.push(height ? `${width}x${height}` : String(width));
  return parts.join("|");
}

/** 라벨로 쓸 수 없는 글자(`|`, `]`, 줄바꿈)를 정리한다. 숫자만 있는 라벨은 크기와 구분할 수 없어서 null이다. */
export function sanitizeLabel(label: string): string | null {
  const clean = label.replace(/[|\]\n\r]/g, " ").replace(/\s+/g, " ").trim();
  return SIZE_PART.test(clean) ? null : clean;
}

export function clampSize(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded < 1 ? null : Math.min(rounded, 8000);
}

export interface EmbedAttrs extends EmbedParams {
  target: string;
  syntax: "wiki" | "markdown";
  /** 일반 마크다운 이미지의 `"제목"` 부분 */
  title: string;
}

export function formatWikiEmbed(attrs: Pick<EmbedAttrs, "target" | "label" | "width" | "height">) {
  const params = formatEmbedParams(attrs);
  return `![[${attrs.target}${params ? `|${params}` : ""}]]`;
}

function encodeMarkdownTarget(target: string) {
  return isRemoteUrl(target) ? target : target.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

export function formatMarkdownEmbed(attrs: Pick<EmbedAttrs, "target" | "label" | "width" | "height" | "title">) {
  const alt = formatEmbedParams(attrs);
  const title = attrs.title ? ` "${attrs.title}"` : "";
  return `![${alt}](${encodeMarkdownTarget(attrs.target)}${title})`;
}

export function formatEmbed(attrs: EmbedAttrs) {
  return attrs.syntax === "markdown" ? formatMarkdownEmbed(attrs) : formatWikiEmbed(attrs);
}

export function decodeMarkdownTarget(raw: string) {
  const inner = raw.startsWith("<") && raw.endsWith(">") ? raw.slice(1, -1) : raw;
  if (isRemoteUrl(inner)) return inner;
  try {
    return decodeURIComponent(inner);
  } catch {
    return inner;
  }
}

/** 렌더러가 작업 폴더 안의 파일을 불러올 때 쓰는 주소 (메인 프로세스의 handy-asset 프로토콜) */
export const ASSET_SCHEME = "handy-asset";

export function assetUrl(path: string) {
  return `${ASSET_SCHEME}://vault/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * 임베드 대상 이름으로 첨부 파일을 찾는다.
 * `폴더/파일.png`는 작업 폴더 기준(없으면 글이 있는 폴더 기준), 파일 이름만 쓰면 어느 폴더든 이름이 같은 파일을 찾는다.
 */
export function resolveAttachment(attachments: AttachmentMeta[], target: string, noteFolder = ""): AttachmentMeta | null {
  const clean = target.split("#")[0]?.trim().replace(/^\.?\//, "") ?? "";
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const byPath = (path: string) => attachments.find((a) => a.path.toLowerCase() === path.toLowerCase());

  if (clean.includes("/")) {
    return byPath(clean) ?? (noteFolder ? byPath(`${noteFolder}/${clean}`) : undefined) ?? null;
  }
  const sameName = attachments.filter((a) => a.name.toLowerCase() === lower);
  // 글과 같은 폴더 → 앱이 첨부를 모아 두는 폴더 → 경로가 짧은 파일 순으로 고른다.
  const rank = (a: AttachmentMeta) => {
    const folder = a.path.slice(0, a.path.lastIndexOf("/")).toLowerCase();
    if (noteFolder && folder === noteFolder.toLowerCase()) return 0;
    return folder === ATTACHMENT_DIR ? 1 : 2;
  };
  return sameName.sort((a, b) => rank(a) - rank(b) || a.path.length - b.path.length)[0] ?? null;
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)}KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)}MB`;
}
