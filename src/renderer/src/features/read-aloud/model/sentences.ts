import type { Node as PmNode } from "@tiptap/pm/model";

/** 문장 끝: 마침표·물음표·느낌표·말줄임표(뒤에 닫는 따옴표·괄호가 붙어도 된다) 다음에 빈칸이나 글 끝 */
const SENTENCE_END = /[.!?。…]+["'”’」』)\]]*(?=\s|$)/g;

/** 글을 문장으로 나눈 [시작, 끝) 목록. 앞뒤 빈칸은 빼고, 글자·숫자가 없는 조각은 버린다. */
export function splitSentences(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const push = (start: number, end: number) => {
    while (start < end && /\s/.test(text[start]!)) start++;
    while (end > start && /\s/.test(text[end - 1]!)) end--;
    if (/[\p{L}\p{N}]/u.test(text.slice(start, end))) spans.push([start, end]);
  };
  let start = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    push(start, end);
    start = end;
  }
  push(start, text.length);
  return spans;
}

export interface Sentence {
  /** 문서 안 위치 [from, to) */
  from: number;
  to: number;
}

/**
 * 문서의 [start, end) 안에 있는 문단·제목·목록의 글을 문장으로 나눈다. 코드 블록은 읽지 않는다.
 * 문단 하나가 문장의 끝이 되므로, 마침표 없는 제목도 한 문장으로 읽는다.
 */
export function collectSentences(doc: PmNode, start: number, end: number): Sentence[] {
  const out: Sentence[] = [];
  doc.nodesBetween(start, end, (node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isTextblock) return true;
    let text = "";
    const at: number[] = [];
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return;
      for (let i = 0; i < child.text.length; i++) at.push(pos + 1 + offset + i);
      text += child.text;
    });
    for (const [s, e] of splitSentences(text)) {
      const from = Math.max(at[s]!, start);
      const to = Math.min(at[e - 1]! + 1, end);
      if (to > from) out.push({ from, to });
    }
    return false;
  });
  return out;
}
