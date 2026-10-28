/** 한국어 글을 묵독하는 속도 (공백을 뺀 글자 수 기준, 분당) */
const CHARS_PER_MINUTE = 500;

export interface TextStats {
  /** 공백 포함 글자 수 */
  chars: number;
  /** 공백을 뺀 글자 수 */
  charsNoSpace: number;
  /** 읽는 데 걸리는 시간(분). 글이 있으면 최소 1분 */
  readMinutes: number;
}

export function textStats(text: string): TextStats {
  const chars = [...text.replace(/[\r\n]+/g, "")].length;
  const charsNoSpace = [...text.replace(/\s+/g, "")].length;
  return { chars, charsNoSpace, readMinutes: charsNoSpace === 0 ? 0 : Math.max(1, Math.round(charsNoSpace / CHARS_PER_MINUTE)) };
}
