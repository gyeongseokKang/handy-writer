import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { resolveInside } from "../notes-fs";

/** 글쓰기 룰은 작업 폴더 안의 파일 하나라서 git으로 글과 함께 관리된다. */
export const RULES_PATH = ".handy-writer/rules.md";

export async function readRules(root: string) {
  try {
    return await readFile(resolveInside(root, RULES_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function writeRules(root: string, content: string) {
  const abs = resolveInside(root, RULES_PATH);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}
