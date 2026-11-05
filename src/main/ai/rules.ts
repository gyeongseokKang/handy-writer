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

/** 퇴고 룰: 퇴고할 때 볼 기준. 글쓰기 룰처럼 작업 폴더 안 파일 하나라 글과 함께 git으로 관리된다. */
export const REVISE_RULES_PATH = ".handy-writer/revise-rules.md";

export async function readReviseRules(root: string) {
  try {
    return await readFile(resolveInside(root, REVISE_RULES_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function writeReviseRules(root: string, content: string) {
  const abs = resolveInside(root, REVISE_RULES_PATH);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}
