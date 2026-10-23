import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface Config {
  workspaceRoot: string | null;
}

const configPath = () => join(app.getPath("userData"), "config.json");

export async function loadWorkspaceRoot(): Promise<string | null> {
  try {
    const config = JSON.parse(await readFile(configPath(), "utf8")) as Config;
    return config.workspaceRoot ?? null;
  } catch {
    return null;
  }
}

export async function saveWorkspaceRoot(workspaceRoot: string | null) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(configPath(), JSON.stringify({ workspaceRoot } satisfies Config, null, 2), "utf8");
}
