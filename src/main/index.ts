import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";

import { registerLogIpc } from "./app-log";
import { handleAssetProtocol, registerAssetScheme } from "./asset-protocol";
import { getWorkspaceRoot, registerIpc } from "./ipc";
import { IPC } from "../shared/types";
import { startAutoUpdate } from "./auto-update";

registerAssetScheme();
// 시작하는 동안 생긴 오류도 남도록 가장 먼저 등록한다.
registerLogIpc();

/** 창을 닫기 전에 화면이 저장을 마칠 때까지 기다리는 최대 시간. 화면이 멈췄어도 창은 닫혀야 한다. */
const CLOSE_TIMEOUT_MS = 4000;
const closeReplies = new Map<number, (unsaved: string[]) => void>();

ipcMain.on(IPC.appCloseReady, (event, unsaved: unknown) => {
  const paths = Array.isArray(unsaved) ? unsaved.filter((p): p is string => typeof p === "string") : [];
  closeReplies.get(event.sender.id)?.(paths);
});

/** 화면에 남은 저장을 마치게 하고, 그래도 못 쓴 글이 있으면 닫을지 묻는다. 닫아도 되면 true */
async function readyToClose(win: BrowserWindow) {
  const id = win.webContents.id;
  const unsaved = await new Promise<string[]>((resolve) => {
    const timer = setTimeout(() => resolve([]), CLOSE_TIMEOUT_MS);
    closeReplies.set(id, (paths) => {
      clearTimeout(timer);
      resolve(paths);
    });
    win.webContents.send(IPC.appBeforeClose);
  }).finally(() => closeReplies.delete(id));
  if (unsaved.length === 0 || win.isDestroyed()) return true;
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["취소", "저장하지 않고 닫기"],
    defaultId: 0,
    cancelId: 0,
    message: "저장하지 못한 글이 있어요",
    detail: `${unsaved.map((p) => `• ${p.replace(/\.md$/, "")}`).join("\n")}\n\n닫으면 이 글들의 마지막 변경이 사라져요.`,
  });
  return response === 1;
}

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

  // 닫기 전에 저장을 마치고, 저장하지 못한 글이 있으면 묻는다.
  let closing = false;
  win.on("close", (event) => {
    if (closing || win.webContents.isCrashed()) return;
    event.preventDefault();
    void readyToClose(win).then((ok) => {
      if (!ok || win.isDestroyed()) return;
      closing = true;
      win.close();
    });
  });

  // Ctrl/Cmd+W는 기본 메뉴가 창을 닫아 버리므로 가로채서 화면에 "지금 탭 닫기"로 보낸다.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key.toLowerCase() !== "w" || input.shift || input.alt) return;
    if (!(process.platform === "darwin" ? input.meta : input.control)) return;
    event.preventDefault();
    win.webContents.send(IPC.tabsCloseCurrent);
  });

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
