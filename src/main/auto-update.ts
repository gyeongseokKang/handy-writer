import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";

import { IPC } from "../shared/types";
import { createUpdater, type UpdaterLike } from "./updater";

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function unsupportedReason(): string | null {
  if (!app.isPackaged) return "설치한 앱에서만 업데이트를 확인해요";
  if (process.platform === "linux" && !process.env["APPIMAGE"]) return "AppImage로 실행할 때만 자동 업데이트를 쓸 수 있어요";
  return null;
}

/** 설치된 앱이면 시작 직후와 6시간마다 새 버전을 확인하고, 있으면 내려받아 다음 종료 때(또는 바로) 설치한다. */
export function startAutoUpdate() {
  const updater = createUpdater({
    updater: electronUpdater.autoUpdater as unknown as UpdaterLike,
    unsupportedReason,
    onState: (state) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateState, state);
    },
  });

  ipcMain.handle(IPC.updateGet, () => updater.getState());
  ipcMain.handle(IPC.updateCheck, () => updater.check());
  ipcMain.handle(IPC.updateInstall, () => updater.install());

  if (updater.getState().status === "unsupported") return;
  setTimeout(() => void updater.check(), FIRST_CHECK_DELAY_MS).unref();
  setInterval(() => void updater.check(), CHECK_INTERVAL_MS).unref();
}
