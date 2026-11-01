import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { api } from "@/shared/api/handy-api";

/** 문장 하나의 문서 안 위치와 글 */
export interface SentenceRange {
  from: number;
  to: number;
  text: string;
}

const SENTENCE_END = /[.!?。…]/;
const LEAF = "￼";

/**
 * 주어진 범위가 든 문장의 범위를 구한다 (같은 문단 안에서, 마침표·물음표·느낌표·줄임표까지).
 * 범위가 이미 한 문장 전체이거나 여러 문장에 걸쳐 있으면 그 범위를 그대로 쓴다.
 */
export function sentenceAround(doc: ProseMirrorNode, from: number, to: number): SentenceRange | null {
  if (from < 0 || to > doc.content.size || from >= to) return null;
  const $from = doc.resolve(from);
  const block = $from.parent;
  if (!block.isTextblock || !doc.resolve(to).sameParent($from)) return null;
  const start = $from.start();
  const text = block.textBetween(0, block.content.size, undefined, LEAF);
  let a = from - start;
  let b = to - start;
  // 앞으로: 앞 문장의 끝 다음 글자까지
  while (a > 0 && !SENTENCE_END.test(text[a - 1] ?? "")) a--;
  // 뒤로: 이 문장의 끝(문장부호 포함)까지
  while (b < text.length && !SENTENCE_END.test(text[b - 1] ?? "")) b++;
  while (b < text.length && /["'”’)\]]/.test(text[b] ?? "")) b++;
  const slice = text.slice(a, b);
  const lead = slice.length - slice.trimStart().length;
  const trimmed = slice.trim();
  if (!trimmed || trimmed.includes(LEAF)) return null;
  return { from: start + a + lead, to: start + a + lead + trimmed.length, text: trimmed };
}

/** AI가 돌려준 글을 문장 자리에 끼울 수 있게 한 줄로 만든다 (따옴표·번호·줄바꿈을 걷어 낸다). */
export function cleanPolished(output: string) {
  return output
    .replace(/^\s*```[a-z]*\n?|\n?```\s*$/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .trim();
}

export interface PolishRun {
  result: Promise<string>;
  cancel: () => void;
}

/**
 * 문장 하나를 AI로 다듬는다. 다듬기 창과는 따로 도는 한 번짜리 실행이다.
 * hint는 왜 다듬는지(예: "문장이 131자예요. 두 문장으로 나누면 읽기 쉬워요.")
 */
export function polishSentence(text: string, hint: string, noteName: string): PolishRun {
  const runId = crypto.randomUUID();
  let off = () => {};
  let rejectRun: (error: Error) => void = () => {};
  const result = new Promise<string>((resolve, reject) => {
    rejectRun = reject;
    off = api.ai.onEvent((event) => {
      if (event.runId !== runId) return;
      if (event.type === "done") resolve(cleanPolished(event.text));
      else if (event.type === "error") reject(new Error(event.message));
    });
    void (async () => {
      try {
        const status = await api.ai.status();
        if (!status.available) throw new Error(status.reason ?? "AI를 쓸 수 없어요.");
        await api.ai.run({
          runId,
          task: "custom",
          rules: await api.rules.get(),
          noteName,
          text,
          before: "",
          instruction: `이 문장을 다듬으세요. ${hint} 의미와 사실은 바꾸지 말고, 문장이 길면 두세 문장으로 나누세요. 다듬은 문장만 한 문단으로 출력하세요.`,
          templatePrompt: "",
          web: false,
          groundedOnly: false,
          references: [],
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  }).finally(() => off());
  return {
    result,
    cancel: () => {
      void api.ai.cancel(runId).catch(() => {});
      rejectRun(new Error("취소했어요."));
    },
  };
}
