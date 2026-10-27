import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

import { registerLogIpc } from "./app-log";
import { handleAssetProtocol, registerAssetScheme } from "./asset-protocol";
import { getWorkspaceRoot, registerIpc } from "./ipc";
import { startAutoUpdate } from "./auto-update";

registerAssetScheme();
// 시작하는 동안 생긴 오류도 남도록 가장 먼저 등록한다.
registerLogIpc();

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 520,
    show: false,
    title: "Handy Writer",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  win.on("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await registerIpc();
  handleAssetProtocol(getWorkspaceRoot);
  createWindow();
  startAutoUpdate();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
