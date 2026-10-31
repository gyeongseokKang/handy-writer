/**
 * Word(.docx)로 내보낼 글의 모양. 화면(렌더러)이 내보내기용 HTML을 이 모양으로 풀고,
 * 메인 프로세스가 그림 파일을 읽어 실제 .docx를 만든다.
 */

export interface DocText {
  type: "text";
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  /** 링크 주소 (http, https, mailto만) */
  link?: string;
}

export interface DocImage {
  type: "image";
  /** `handy-asset://` 주소, data: 주소, 또는 http(s) 주소 */
  src: string;
  /** 보여 줄 크기 (px). 모르면 0 */
  width: number;
  height: number;
  alt: string;
}

export type DocInline = DocText | DocImage | { type: "break" } | { type: "footnote"; id: number };

export interface DocParagraph {
  type: "paragraph";
  children: DocInline[];
  /** 인용·콜아웃 안이면 그 깊이 (왼쪽 들여쓰기와 선) */
  quote?: number;
  /** 그림·표 캡션은 가운데, 콜아웃 머리는 굵게 */
  role?: "caption" | "callout-title";
}

export interface DocHeading {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: DocInline[];
}

export interface DocListItem {
  type: "list-item";
  /** 번호 목록이면 그 목록의 번호 (같은 목록끼리 같은 수) */
  ordered: number | null;
  /** 0부터 시작하는 중첩 깊이 */
  level: number;
  /** 할 일 목록이면 체크 여부 */
  checked: boolean | null;
  children: DocInline[];
  quote?: number;
}

export interface DocCode {
  type: "code";
  text: string;
  quote?: number;
}

export interface DocTable {
  type: "table";
  rows: { header: boolean; cells: DocInline[][] }[];
}

export type DocBlock = DocParagraph | DocHeading | DocListItem | DocCode | DocTable | { type: "rule" };

export interface DocModel {
  title: string;
  blocks: DocBlock[];
  /** 각주 번호 → 내용 */
  footnotes: Record<number, DocInline[]>;
}

/** 다른 프로세스에서 넘어온 값을 믿기 전에 모양만 확인한다. */
export function isDocModel(value: unknown): value is DocModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<DocModel>;
  return typeof model.title === "string" && Array.isArray(model.blocks) && !!model.footnotes && typeof model.footnotes === "object";
}
