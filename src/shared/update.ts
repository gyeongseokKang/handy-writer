export type UpdateState =
  | { status: "unsupported"; reason: string }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "none" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

export const UPDATE_LABEL = (state: UpdateState): string => {
  switch (state.status) {
    case "checking":
      return "업데이트 확인 중…";
    case "none":
      return "최신 버전이에요";
    case "downloading":
      return `새 버전 ${state.version} 받는 중 ${Math.round(state.percent)}%`;
    case "ready":
      return `새 버전 ${state.version} 준비됨`;
    case "error":
      return `업데이트 확인 실패: ${state.message}`;
    case "unsupported":
      return state.reason;
    default:
      return "";
  }
};
