import { create } from "zustand";

import type { DeployStatus, ReviewRepoStatus } from "@shared/review";
import type { ReviewConfig } from "@shared/types";
import { api } from "@/shared/api/handy-api";

interface ReviewRepoState {
  config: ReviewConfig | null;
  repo: ReviewRepoStatus | null;
  deploy: DeployStatus | null;
  checking: boolean;
  /** 설정과 Git 상태를 다시 읽는다. deploy면 사이트 배포 상태까지 확인한다(원격을 받아 와서 조금 느리다). */
  refresh: (options?: { deploy?: boolean }) => Promise<void>;
  setConfig: (config: ReviewConfig) => void;
}

/** 연결된 핸디 리뷰 저장소. 사이드바 저장소 목록과 연결 탭의 리뷰 칸이 같이 본다. */
export const useReviewRepoStore = create<ReviewRepoState>((set, get) => ({
  config: null,
  repo: null,
  deploy: null,
  checking: false,
  refresh: async ({ deploy = false } = {}) => {
    try {
      const config = await api.review.getConfig();
      set({ config });
      if (!config.repo) return set({ repo: null, deploy: null });
      if (deploy) {
        set({ checking: true });
        const status = await api.review.deployStatus().catch(() => null);
        set({ deploy: status });
      }
      set({ repo: await api.review.repoStatus() });
    } finally {
      if (get().checking) set({ checking: false });
    }
  },
  setConfig: (config) => {
    set({ config });
    void get().refresh({ deploy: true });
  },
}));
