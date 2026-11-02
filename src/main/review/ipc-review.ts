import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";

import { IPC } from "../../shared/types";
import type { DeployProviderInfo, ReviewCategory, ReviewPost } from "../../shared/review";
import {
  checkReviewRepo, createPost, deployStatus, listPosts, loadReviewConfig, publishPost, readPost, saveImage, saveReviewConfig, writePost,
} from "./review-service";

async function repoOrThrow() {
  const { repo } = await loadReviewConfig();
  if (!repo) throw new Error("리뷰 저장소 폴더를 먼저 골라 주세요.");
  return repo;
}

export function registerReviewIpc() {
  ipcMain.handle(IPC.reviewGetConfig, () => loadReviewConfig());
  ipcMain.handle(IPC.reviewChooseRepo, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: "리뷰 저장소 폴더 선택", properties: ["openDirectory" as const] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const config = await loadReviewConfig();
    if (result.canceled || !result.filePaths[0]) return config;
    await checkReviewRepo(result.filePaths[0]);
    return saveReviewConfig({ ...config, repo: result.filePaths[0] });
  });
  ipcMain.handle(IPC.reviewSetDeploy, async (_e, deploy: DeployProviderInfo | null) => saveReviewConfig({ ...(await loadReviewConfig()), deploy }));
  ipcMain.handle(IPC.reviewList, async () => listPosts(await repoOrThrow()));
  ipcMain.handle(IPC.reviewCreate, async (_e, category: ReviewCategory, title: string) => createPost(await repoOrThrow(), category, title));
  ipcMain.handle(IPC.reviewRead, async (_e, path: string) => readPost(await repoOrThrow(), path));
  ipcMain.handle(IPC.reviewWrite, async (_e, post: ReviewPost) => writePost(await repoOrThrow(), post));
  ipcMain.handle(IPC.reviewSaveImage, async (_e, postPath: string, name: string, data: Uint8Array) => saveImage(await repoOrThrow(), postPath, name, data));
  ipcMain.handle(IPC.reviewPublish, async (_e, postPath: string) => publishPost(await repoOrThrow(), postPath));
  ipcMain.handle(IPC.reviewDeployStatus, async () => {
    const config = await loadReviewConfig();
    if (!config.repo) throw new Error("리뷰 저장소 폴더를 먼저 골라 주세요.");
    return deployStatus(config.repo, config.deploy);
  });
  ipcMain.handle(IPC.reviewReveal, async (_e, path: string) => shell.showItemInFolder(join(await repoOrThrow(), path)));
}
