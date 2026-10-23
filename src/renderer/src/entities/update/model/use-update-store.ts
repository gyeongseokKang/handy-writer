import { toast } from "sonner";
import { create } from "zustand";

import { api } from "@/shared/api/handy-api";
import type { UpdateState } from "@shared/update";

interface UpdateStore {
  state: UpdateState;
  set: (state: UpdateState) => void;
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  state: { status: "idle" },
  set: (state) => set({ state }),
}));

/** 메인 프로세스의 업데이트 상태를 따라가고, 새 버전이 준비되면 한 번 알려준다. */
export function startUpdateSync() {
  let notified = "";
  const apply = (state: UpdateState) => {
    useUpdateStore.getState().set(state);
    if (state.status === "ready" && notified !== state.version) {
      notified = state.version;
      toast(`새 버전 ${state.version}이 준비됐어요`, {
        duration: Infinity,
        action: { label: "다시 시작해서 설치", onClick: () => void api.update.install() },
      });
    }
  };
  void api.update.getState().then(apply);
  return api.update.onState(apply);
}
