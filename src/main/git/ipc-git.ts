import { BrowserWindow, ipcMain } from "electron";

import { IPC } from "../../shared/types";
import { logEntry } from "../app-log";
import { DEFAULT_GIT_SETTINGS, type GitEvent, type GitOpResult } from "../../shared/git";
import { resolveInside } from "../notes-fs";
import { AutoTimer } from "./auto-timer";
import { formatCommitMessage, GitService } from "./git-service";
import { loadGitSettings, saveGitSettings } from "./git-settings";

const PULL_ON_START_DELAY_MS = 2000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** 작업 폴더의 git 명령을 IPC로 열어 주고, 자동 커밋과 시작 시 가져오기를 맡는다. */
export function createGitIpc(requireRoot: () => string) {
  const service = new GitService();
  let currentRoot: string | null = null;
  let lastAutoError = "";

  const broadcast = (event: GitEvent) => {
    if (event.kind === "error") logEntry({ level: "error", source: "Git", message: event.message });
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC.gitEvent, event);
  };
  const broadcastStatus = async (root: string) => broadcast({ kind: "status", status: await service.status(root) });

  const autoTimer = new AutoTimer(async () => {
    const root = currentRoot;
    if (!root) return;
    try {
      const settings = await loadGitSettings(root);
      const status = await service.status(root);
      if (!status.isRepo || status.merging) return;
      if (status.changes.length > 0) await service.commit(root, formatCommitMessage(settings.commitMessage));
      const after = await service.status(root);
      if (settings.autoPush && after.hasRemote && after.behind === 0 && (after.ahead > 0 || !after.upstream) && after.lastCommit) {
        await service.push(root);
      }
      lastAutoError = "";
      await broadcastStatus(root);
    } catch (error) {
      const message = errorMessage(error);
      // 같은 오류가 간격마다 반복해서 뜨지 않게 한다.
      if (message !== lastAutoError) broadcast({ kind: "error", message: `자동 저장 실패: ${message}` });
      lastAutoError = message;
    }
  });

  async function applyAutomation(root: string) {
    const settings = await loadGitSettings(root);
    autoTimer.start(settings.autoCommitMinutes);
  }

  async function pullOnStart(root: string) {
    try {
      const settings = await loadGitSettings(root);
      if (!settings.pullOnStart) return;
      const status = await service.status(root);
      if (!status.isRepo || !status.hasRemote || status.merging || status.changes.length > 0) return;
      const result = await service.pull(root);
      if (result.outcome === "conflict") broadcast({ kind: "error", message: result.message });
      else if (result.outcome === "fast-forward" || result.outcome === "merged") broadcast({ kind: "info", message: result.message });
      await broadcastStatus(root);
    } catch (error) {
      broadcast({ kind: "error", message: `시작 시 가져오기 실패: ${errorMessage(error)}` });
    }
  }

  /** 작업 폴더가 정해지거나 바뀔 때 부른다. */
  function onRootChanged(root: string | null) {
    currentRoot = root;
    lastAutoError = "";
    autoTimer.stop();
    if (!root) return;
    void applyAutomation(root);
    setTimeout(() => void pullOnStart(root), PULL_ON_START_DELAY_MS);
  }

  async function op(run: (root: string) => Promise<GitOpResult>): Promise<GitOpResult> {
    const root = requireRoot();
    try {
      return await run(root);
    } finally {
      void broadcastStatus(root);
    }
  }

  function register() {
    ipcMain.handle(IPC.gitStatus, () => service.status(requireRoot()));
    ipcMain.handle(IPC.gitInit, () => service.init(requireRoot()));
    ipcMain.handle(IPC.gitSetRemote, (_e, url: string) => service.setRemote(requireRoot(), String(url)));
    ipcMain.handle(IPC.gitCommit, (_e, message: string) =>
      op(async (root) => service.commit(root, String(message ?? "").trim() || formatCommitMessage((await loadGitSettings(root)).commitMessage))),
    );
    ipcMain.handle(IPC.gitPull, () => op((root) => service.pull(root)));
    ipcMain.handle(IPC.gitPush, () => op((root) => service.push(root)));
    ipcMain.handle(IPC.gitSync, () => op(async (root) => service.sync(root, await loadGitSettings(root))));
    ipcMain.handle(IPC.gitHistory, (_e, path: string) => {
      const root = requireRoot();
      resolveInside(root, String(path));
      return service.history(root, String(path));
    });
    ipcMain.handle(IPC.gitReadVersion, (_e, hash: string, blobPath: string) => service.readVersion(requireRoot(), String(hash), String(blobPath)));
    ipcMain.handle(IPC.gitGetSettings, async () => loadGitSettings(requireRoot()));
    ipcMain.handle(IPC.gitSetSettings, async (_e, settings: unknown) => {
      const root = requireRoot();
      const saved = await saveGitSettings(root, settings);
      await applyAutomation(root);
      return saved;
    });
  }

  return { register, onRootChanged, defaults: DEFAULT_GIT_SETTINGS };
}
