export type AiTask = "polish" | "proofread" | "continue" | "custom";

export interface AiReference {
  name: string;
  content: string;
}

export interface AiRequest {
  /** 렌더러가 만든 실행 ID. 결과 이벤트를 이 ID로 구분한다. */
  runId: string;
  task: AiTask;
  /** 글쓰기 룰(`.handy-writer/rules.md`) 내용 */
  rules: string;
  /** 현재 글의 이름 */
  noteName: string;
  /** 다듬거나 교정할 대상 (continue에서는 쓰지 않는다) */
  text: string;
  /** continue: 커서 앞까지의 글 */
  before: string;
  /** custom: 사용자의 지시 */
  instruction: string;
  references: AiReference[];
}

export interface AiStatus {
  available: boolean;
  version?: string;
  path?: string;
  /** 사용할 수 없을 때 이유 */
  reason?: string;
}

export type AiEvent =
  | { runId: string; type: "delta"; text: string }
  | { runId: string; type: "done"; text: string }
  | { runId: string; type: "error"; message: string };
