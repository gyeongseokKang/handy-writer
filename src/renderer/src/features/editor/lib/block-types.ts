import type { Editor } from "@tiptap/core";

/**
 * 블록 종류. 이미 쓴 글의 블록을 이 종류로 바꾼다 (새 블록을 만들지 않는다).
 * 목록·인용 안에 있어도 먼저 풀어서(clearNodes) 어떤 종류에서든 어떤 종류로든 바뀌게 한다.
 * shortcut의 숫자는 Notion과 같은 `Ctrl/Cmd+Alt+숫자`다.
 */
export interface BlockType {
  id: string;
  label: string;
  /** 숫자 단축키 (Ctrl/Cmd+Alt+숫자) */
  digit: number;
  is: (editor: Editor) => boolean;
  set: (editor: Editor) => boolean;
}

const inList = (e: Editor) => e.isActive("bulletList") || e.isActive("orderedList") || e.isActive("taskList");

export const BLOCK_TYPES: BlockType[] = [
  { id: "paragraph", label: "본문", digit: 0, is: (e) => e.isActive("paragraph") && !inList(e) && !e.isActive("blockquote"), set: (e) => e.chain().focus().clearNodes().run() },
  { id: "h1", label: "제목 1", digit: 1, is: (e) => e.isActive("heading", { level: 1 }), set: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 1 }).run() },
  { id: "h2", label: "제목 2", digit: 2, is: (e) => e.isActive("heading", { level: 2 }), set: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 2 }).run() },
  { id: "h3", label: "제목 3", digit: 3, is: (e) => e.isActive("heading", { level: 3 }), set: (e) => e.chain().focus().clearNodes().setNode("heading", { level: 3 }).run() },
  { id: "task", label: "할 일 목록", digit: 4, is: (e) => e.isActive("taskList"), set: (e) => e.chain().focus().clearNodes().toggleTaskList().run() },
  { id: "bullet", label: "글머리 기호 목록", digit: 5, is: (e) => e.isActive("bulletList"), set: (e) => e.chain().focus().clearNodes().toggleBulletList().run() },
  { id: "ordered", label: "번호 목록", digit: 6, is: (e) => e.isActive("orderedList"), set: (e) => e.chain().focus().clearNodes().toggleOrderedList().run() },
  { id: "quote", label: "인용", digit: 7, is: (e) => e.isActive("blockquote"), set: (e) => e.chain().focus().clearNodes().toggleBlockquote().run() },
  { id: "code", label: "코드 블록", digit: 8, is: (e) => e.isActive("codeBlock"), set: (e) => e.chain().focus().clearNodes().toggleCodeBlock().run() },
];

export const blockShortcut = (type: BlockType) => `Mod+Alt+${type.digit}`;

/** 지금 선택이 걸친 블록의 종류 (여러 종류에 걸치면 맨 앞 블록 기준) */
export function currentBlockType(editor: Editor) {
  return BLOCK_TYPES.find((type) => type.is(editor)) ?? BLOCK_TYPES[0]!;
}

/** 블록 종류를 바꿀 수 있는 최상위 블록인지 (표, 콜아웃, 그림 같은 것은 바꾸지 않는다) */
export const CONVERTIBLE_BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock"]);
