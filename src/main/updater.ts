import type { UpdateState } from "../shared/update";

/** electron-updater의 autoUpdater 중 우리가 쓰는 부분. 테스트에서 가짜로 바꿔 끼운다. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: "checking-for-update" | "update-not-available", listener: () => void): unknown;
  on(event: "update-available" | "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdaterOptions {
  updater: UpdaterLike;
  /** 설치된 앱이 아니거나(개발 모드) 자동 업데이트를 못 쓰는 환경이면 이유를 돌려준다. */
  unsupportedReason: () => string | null;
  onState: (state: UpdateState) => void;
}

export function createUpdater({ updater, unsupportedReason, onState }: UpdaterOptions) {
  let state: UpdateState = { status: "idle" };
  const set = (next: UpdateState) => {
    state = next;
    onState(next);
  };

  const reason = unsupportedReason();
  if (reason) {
    state = { status: "unsupported", reason };
  } else {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.on("checking-for-update", () => set({ status: "checking" }));
    updater.on("update-not-available", () => set({ status: "none" }));
    updater.on("update-available", (info) => set({ status: "downloading", version: info.version, percent: 0 }));
    updater.on("download-progress", (progress) => {
      if (state.status === "downloading") set({ ...state, percent: progress.percent });
    });
    updater.on("update-downloaded", (info) => set({ status: "ready", version: info.version }));
    updater.on("error", (error) => set({ status: "error", message: error.message.split("\n")[0].slice(0, 120) }));
  }

  return {
    getState: () => state,
    async check() {
      if (state.status === "unsupported" || state.status === "checking" || state.status === "downloading" || state.status === "ready") return state;
      try {
        await updater.checkForUpdates();
      } catch (error) {
        set({ status: "error", message: error instanceof Error ? error.message.split("\n")[0].slice(0, 120) : String(error) });
      }
      return state;
    },
    install() {
      if (state.status === "ready") updater.quitAndInstall();
    },
  };
}
