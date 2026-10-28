import type { DraftBrief } from "./draft";
import type { DraftSource } from "./draft-sources";

export type AiTask = "polish" | "proofread" | "continue" | "custom" | "template" | "outline" | "draft";

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
  /** custom: 사용자의 지시, template: 추가 요청 */
  instruction: string;
  /** template: 입력값이 채워진 사전 프롬프트 */
  templatePrompt: string;
  /** template: 웹 검색(WebSearch, WebFetch)을 허용할지. 다른 작업에서는 항상 꺼진다. */
  web: boolean;
  /** template: 본문과 참고 글에 있는 내용만 쓰게 할지 (웹 검색은 꺼진다) */
  groundedOnly: boolean;
  references: AiReference[];
  /** outline, draft: 초안 기본정보 */
  brief?: DraftBrief;
  /** draft: 초안의 뼈대가 될 목차 (마크다운) */
  outline?: string;
  /** outline, draft: 유튜브 자막과 프로젝트 폴더 같은 자료 */
  sources?: DraftSource[];
}

export interface AiStatus {
  available: boolean;
  version?: string;
  path?: string;
  /** 사용할 수 없을 때 이유 */
  reason?: string;
  /** 사용할 수 없는 까닭: 설치되지 않음 / 로그인 안 됨 / 그 밖의 실행 오류 */
  problem?: "missing" | "login" | "error";
}

export type AiEvent =
  | { runId: string; type: "delta"; text: string }
  /** 웹 검색 같은 도구를 쓰는 동안 보여줄 상태 ("웹 검색 중…") */
  | { runId: string; type: "status"; text: string }
  /** 도구를 쓰기 전의 중간 발화를 지우라는 신호 (새 응답 턴이 시작됐다) */
  | { runId: string; type: "reset" }
  | { runId: string; type: "done"; text: string }
  | { runId: string; type: "error"; message: string };
