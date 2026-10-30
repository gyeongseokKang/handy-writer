import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { STYLE_DICTIONARY_PATH } from "../shared/style-lint";
import { resolveInside } from "./notes-fs";

/** 내 표기 사전은 작업 폴더 안의 파일 하나라서 git으로 글과 함께 관리된다. 없으면 빈 문자열 */
export async function readStyleDictionary(root: string) {
  try {
    return await readFile(resolveInside(root, STYLE_DICTIONARY_PATH), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function writeStyleDictionary(root: string, content: string) {
  const abs = resolveInside(root, STYLE_DICTIONARY_PATH);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}
