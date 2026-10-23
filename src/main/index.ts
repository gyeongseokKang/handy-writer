import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

import { handleAssetProtocol, registerAssetScheme } from "./asset-protocol";
import { getWorkspaceRoot, registerIpc } from "./ipc";

registerAssetScheme();

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
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
