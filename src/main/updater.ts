import type { UpdateState } from "../shared/update";

/** latest*.yml의 파일 하나 */
export interface UpdateFileInfo {
  url: string;
  sha512: string;
  size?: number;
}

export interface UpdateInfoLike {
  version: string;
  files?: UpdateFileInfo[];
}

/** electron-updater 대신 직접 받아서 설치하는 방법 (서명 없는 맥 앱). */
export interface SelfInstaller {
  download(info: UpdateInfoLike, onProgress: (percent: number) => void): Promise<void>;
  /** 받아 둔 새 버전으로 바꾼다. relaunch면 앱을 끄고 새 버전을 연다. */
  install(relaunch: boolean): void;
}

/** electron-updater의 autoUpdater 중 우리가 쓰는 부분. 테스트에서 가짜로 바꿔 끼운다. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  on(event: "checking-for-update" | "update-not-available", listener: () => void): unknown;
  on(event: "update-available" | "update-downloaded", listener: (info: UpdateInfoLike) => void): unknown;
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
  /** 오류 전체 내용 (화면에는 한 줄로 줄여 보여준다) */
  onError?: (error: unknown) => void;
  /** 있으면 확인만 electron-updater로 하고, 받기와 설치는 이걸로 한다. */
  selfInstaller?: SelfInstaller;
}

export function createUpdater({ updater, unsupportedReason, onState, onError, selfInstaller }: UpdaterOptions) {
  let state: UpdateState = { status: "idle" };
  let installing = false;
  const short = (error: unknown) => (error instanceof Error ? (error.message.split("\n")[0] ?? "").slice(0, 120) : String(error));
  const set = (next: UpdateState) => {
    state = next;
    onState(next);
  };
  const fail = (error: unknown) => {
    onError?.(error);
    set({ status: "error", message: short(error) });
  };

  const reason = unsupportedReason();
  if (reason) {
    state = { status: "unsupported", reason };
  } else {
    updater.autoDownload = !selfInstaller;
    updater.autoInstallOnAppQuit = !selfInstaller;
    updater.allowPrerelease = false;
    updater.on("checking-for-update", () => set({ status: "checking" }));
    updater.on("update-not-available", () => set({ status: "none" }));
    updater.on("update-available", (info) => {
      set({ status: "downloading", version: info.version, percent: 0 });
      if (!selfInstaller) return;
      selfInstaller
        .download(info, (percent) => {
          if (state.status === "downloading") set({ ...state, percent });
        })
        .then(() => set({ status: "ready", version: info.version }))
        .catch((error: unknown) => fail(error));
    });
    updater.on("download-progress", (progress) => {
      if (state.status === "downloading") set({ ...state, percent: progress.percent });
    });
    updater.on("update-downloaded", (info) => set({ status: "ready", version: info.version }));
    updater.on("error", (error) => fail(error));
  }

  return {
    getState: () => state,
    async check() {
      if (state.status === "unsupported" || state.status === "checking" || state.status === "downloading" || state.status === "ready") return state;
      try {
        await updater.checkForUpdates();
      } catch (error) {
        fail(error);
      }
      return state;
    },
    install() {
      if (state.status !== "ready" || installing) return;
      installing = true;
      if (selfInstaller) selfInstaller.install(true);
      else updater.quitAndInstall();
    },
    /** 앱을 끌 때: 받아 둔 새 버전이 있으면 설치한다 (electron-updater는 autoInstallOnAppQuit로 알아서 한다). */
    installOnQuit() {
      if (state.status !== "ready" || installing || !selfInstaller) return;
      installing = true;
      selfInstaller.install(false);
    },
  };
}
