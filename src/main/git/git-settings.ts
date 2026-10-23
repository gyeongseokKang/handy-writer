import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_GIT_SETTINGS, type GitSettings } from "../../shared/git";

const MAX_MINUTES = 24 * 60;

const settingsPath = () => join(app.getPath("userData"), "git-settings.json");

/** 렌더러에서 온 값이나 파일에서 읽은 값을 믿지 않고 모양을 맞춘다. */
export function sanitizeGitSettings(value: unknown): GitSettings {
  const v = (value ?? {}) as Partial<GitSettings>;
  const minutes = Number(v.autoCommitMinutes);
  return {
    autoCommitMinutes: Number.isFinite(minutes) ? Math.min(MAX_MINUTES, Math.max(0, Math.round(minutes))) : DEFAULT_GIT_SETTINGS.autoCommitMinutes,
    autoPush: v.autoPush === true,
    pullOnStart: v.pullOnStart === true,
    commitMessage: typeof v.commitMessage === "string" && v.commitMessage.trim() ? v.commitMessage.slice(0, 200) : DEFAULT_GIT_SETTINGS.commitMessage,
  };
}

async function readAll(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** 작업 폴더마다 따로 저장한다. 컴퓨터마다 다를 수 있는 설정이라 작업 폴더(git) 안에는 넣지 않는다. */
export async function loadGitSettings(root: string): Promise<GitSettings> {
  return sanitizeGitSettings((await readAll())[root]);
}

export async function saveGitSettings(root: string, settings: unknown): Promise<GitSettings> {
  const clean = sanitizeGitSettings(settings);
  const all = await readAll();
  all[root] = clean;
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(all, null, 2), "utf8");
  return clean;
}
