import { app, BrowserWindow, ipcMain, shell } from "electron";
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

import { createLogBook, formatLogLine, parseLogInput, type LogInput } from "../shared/log";
import { IPC } from "../shared/types";

const MAX_FILE_BYTES = 1024 * 1024;

const book = createLogBook();
// 앱 데이터 폴더 안에 둔다 (--user-data-dir로 띄운 테스트가 실제 앱의 로그와 섞이지 않게).
const logDir = () => join(app.getPath("userData"), "logs");
const logFile = () => join(logDir(), "main.log");

/** 파일이 1MB를 넘으면 main.old.log로 넘기고 새로 쓴다. 파일에 못 써도 앱은 계속 돈다. */
let writing: Promise<void> = Promise.resolve();
function writeLine(line: string) {
  writing = writing
    .then(async () => {
      const file = logFile();
      const size = await stat(file).then((s) => s.size, () => 0);
      if (size > MAX_FILE_BYTES) await rename(file, join(logDir(), "main.old.log"));
      await mkdir(logDir(), { recursive: true });
      await appendFile(file, `${line}\n`, "utf8");
    })
    .catch(() => {});
}

/** 오류·경고를 로그 창과 로그 파일에 남긴다. */
export function logEntry(input: LogInput) {
  const entry = book.add(input);
  if (!entry) return;
  writeLine(formatLogLine(entry));
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(IPC.logEntry, entry);
  }
}

export const logError = (source: string, error: unknown) =>
  logEntry({ level: "error", source, message: error instanceof Error ? (error.stack ?? error.message) : String(error) });

export function registerLogIpc() {
  ipcMain.handle(IPC.logList, () => book.list());
  ipcMain.handle(IPC.logClear, () => book.clear());
  ipcMain.handle(IPC.logAdd, (_e, raw: unknown) => {
    const input = parseLogInput(raw);
    if (input) logEntry(input);
  });
  ipcMain.handle(IPC.logReveal, async () => {
    await writing;
    shell.showItemInFolder(logFile());
  });

  // 기본 동작(오류 대화상자 등)은 그대로 두고 기록만 한다.
  process.on("uncaughtExceptionMonitor", (error) => logError("앱", error));
  process.on("unhandledRejection", (reason) => logError("앱", reason));
  app.on("render-process-gone", (_e, _contents, details) =>
    logEntry({ level: "error", source: "화면", message: `화면 프로세스가 멈췄어요 (${details.reason}, 종료 코드 ${details.exitCode}).` }),
  );
}
