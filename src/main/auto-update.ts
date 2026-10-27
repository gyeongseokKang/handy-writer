import { app, BrowserWindow, ipcMain, net } from "electron";
import electronUpdater from "electron-updater";
import { join } from "node:path";

import { IPC } from "../shared/types";
import { logError } from "./app-log";
import { bundlePathOf, createMacSelfInstaller, needsSelfUpdate } from "./mac-self-update";
import { createUpdater, type SelfInstaller, type UpdaterLike } from "./updater";

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function unsupportedReason(): string | null {
  if (!app.isPackaged) return "설치한 앱에서만 업데이트를 확인해요";
  if (process.platform === "linux" && !process.env["APPIMAGE"]) return "AppImage로 실행할 때만 자동 업데이트를 쓸 수 있어요";
  return null;
}

/** 서명(Developer ID) 없는 맥 앱은 Squirrel.Mac이 설치를 거부하므로 직접 받아서 바꿔 끼운다. */
async function macSelfInstaller(): Promise<SelfInstaller | undefined> {
  if (process.platform !== "darwin" || !app.isPackaged) return undefined;
  const bundlePath = bundlePathOf(app.getPath("exe"));
  if (!bundlePath || !(await needsSelfUpdate(bundlePath))) return undefined;
  return createMacSelfInstaller({
    bundlePath,
    resourcesPath: process.resourcesPath,
    workDir: join(app.getPath("temp"), "handy-writer-update"),
    arch: process.arch,
    fetch: (url) => net.fetch(url),
    quit: () => app.quit(),
  });
}

/** 설치된 앱이면 시작 직후와 6시간마다 새 버전을 확인하고, 있으면 내려받아 다음 종료 때(또는 바로) 설치한다. */
export function startAutoUpdate() {
  const ready = macSelfInstaller()
    .catch(() => undefined)
    .then((selfInstaller) =>
      createUpdater({
        updater: electronUpdater.autoUpdater as unknown as UpdaterLike,
        unsupportedReason,
        selfInstaller,
        onError: (error) => logError("업데이트", error),
        onState: (state) => {
          for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateState, state);
        },
      }),
    );

  ipcMain.handle(IPC.updateGet, async () => (await ready).getState());
  ipcMain.handle(IPC.updateCheck, async () => (await ready).check());
  ipcMain.handle(IPC.updateInstall, async () => (await ready).install());

  void ready.then((updater) => {
    app.on("will-quit", () => updater.installOnQuit());
    if (updater.getState().status === "unsupported") return;
    setTimeout(() => void updater.check(), FIRST_CHECK_DELAY_MS).unref();
    setInterval(() => void updater.check(), CHECK_INTERVAL_MS).unref();
  });
}
