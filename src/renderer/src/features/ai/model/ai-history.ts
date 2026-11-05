import type { AiTask } from "@shared/ai";

/** 끝난 AI 결과 하나. 적용하거나 닫아도 남겨서 다시 꺼내 쓴다. */
export interface AiHistoryItem {
  id: string;
  task: AiTask;
  output: string;
  /** 요청한 글 (경로·이름) */
  notePath: string | null;
  noteName: string;
  /** 함께 준 추가 요청 */
  instruction: string;
  /** 끝난 시각 (ISO) */
  at: string;
  /** 퇴고: 무엇을 왜 고쳤는지 */
  notes?: string[];
}

export const MAX_HISTORY = 50;
/** 결과 하나가 너무 길면 이만큼만 남긴다 (브라우저 저장소 한도) */
const MAX_OUTPUT = 20_000;

const keyOf = (root: string | null) => `handy-writer:ai-history:${root ?? ""}`;

/** 작업 폴더마다 따로 기억한다. 못 읽으면 빈 기록. */
export function loadHistory(root: string | null): AiHistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(root)) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as AiHistoryItem[]).filter((i) => i && typeof i.output === "string" && typeof i.id === "string") : [];
  } catch {
    return [];
  }
}

export function saveHistory(root: string | null, items: AiHistoryItem[]) {
  try {
    localStorage.setItem(keyOf(root), JSON.stringify(items));
  } catch {
    // 저장소를 못 써도 이번 실행에서는 보인다.
  }
}

/** 새 결과를 맨 앞에 넣는다. 같은 id는 바꾸고, 빈 결과는 넣지 않으며, 오래된 것부터 덜어 낸다. */
export function addHistory(items: AiHistoryItem[], item: AiHistoryItem): AiHistoryItem[] {
  if (!item.output.trim()) return items;
  const trimmed = item.output.length > MAX_OUTPUT ? { ...item, output: item.output.slice(0, MAX_OUTPUT) } : item;
  return [trimmed, ...items.filter((i) => i.id !== item.id)].slice(0, MAX_HISTORY);
}
