import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";

import { IPC } from "../../shared/types";
import type { DeployProviderInfo } from "../../shared/review";
import { checkReviewRepo, deployStatus, listPosts, loadReviewConfig, reviewRepoStatus, saveReviewConfig } from "./review-service";
import { importReviewToNote, previewNoteReview, publishNoteReview } from "./review-note-service";

async function repoOrThrow() {
  const { repo } = await loadReviewConfig();
  if (!repo) throw new Error("핸디 리뷰 저장소 폴더를 먼저 골라 주세요.");
  return repo;
}

export function registerReviewIpc(requireRoot: () => string) {
  ipcMain.handle(IPC.reviewGetConfig, () => loadReviewConfig());
  ipcMain.handle(IPC.reviewChooseRepo, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "핸디 리뷰 저장소 폴더 선택", properties: ["openDirectory" as const] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const config = await loadReviewConfig();
    if (result.canceled || !result.filePaths[0]) return config;
    await checkReviewRepo(result.filePaths[0]);
    return saveReviewConfig({ ...config, repo: result.filePaths[0] });
  });
  ipcMain.handle(IPC.reviewSetDeploy, async (_e, deploy: DeployProviderInfo | null) => saveReviewConfig({ ...(await loadReviewConfig()), deploy }));
  ipcMain.handle(IPC.reviewList, async () => listPosts(await repoOrThrow()));
  ipcMain.handle(IPC.reviewPreviewNote, async (_e, notePath: string) => previewNoteReview(requireRoot(), await repoOrThrow(), notePath));
  ipcMain.handle(IPC.reviewPublishNote, async (_e, notePath: string) => publishNoteReview(requireRoot(), await repoOrThrow(), notePath));
  ipcMain.handle(IPC.reviewImport, async (_e, postPath: string) => importReviewToNote(requireRoot(), await repoOrThrow(), postPath));
  ipcMain.handle(IPC.reviewDeployStatus, async () => {
    const config = await loadReviewConfig();
    if (!config.repo) throw new Error("핸디 리뷰 저장소 폴더를 먼저 골라 주세요.");
    return deployStatus(config.repo, config.deploy);
  });
  ipcMain.handle(IPC.reviewRepoStatus, async () => {
    const { repo } = await loadReviewConfig();
    return repo ? reviewRepoStatus(repo) : null;
  });
  ipcMain.handle(IPC.reviewReveal, async (_e, path: string) => shell.showItemInFolder(join(await repoOrThrow(), path)));
}
