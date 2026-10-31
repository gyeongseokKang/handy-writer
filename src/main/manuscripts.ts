import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { formatManuscripts, MANUSCRIPTS_PATH, parseManuscripts, remapManuscripts, type ManuscriptConfig, type Manuscripts } from "../shared/manuscript";
import { resolveInside } from "./notes-fs";

export async function readManuscripts(root: string): Promise<Manuscripts> {
  try {
    return parseManuscripts(await readFile(resolveInside(root, MANUSCRIPTS_PATH), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeManuscripts(root: string, all: Manuscripts) {
  const abs = resolveInside(root, MANUSCRIPTS_PATH);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, formatManuscripts(all), "utf8");
}

/** 원고 하나의 설정을 바꾼다. config가 null이면 그 원고 설정을 지운다. */
export async function setManuscript(root: string, folder: string, config: ManuscriptConfig | null) {
  const all = await readManuscripts(root);
  if (config) all[folder] = { order: [...config.order], excluded: [...config.excluded], goal: config.goal && config.goal > 0 ? Math.round(config.goal) : null };
  else delete all[folder];
  await writeManuscripts(root, all);
  return all;
}

/** 글·폴더를 옮기거나 이름을 바꾼 뒤 원고 설정의 경로를 따라 고친다. 원고가 없으면 파일을 만들지 않는다. */
export async function remapManuscriptFile(root: string, map: (path: string) => string | null) {
  try {
    const next = remapManuscripts(await readManuscripts(root), map);
    if (next) await writeManuscripts(root, next);
  } catch {
    // 원고 설정을 못 고쳐도 이름 바꾸기 자체는 성공이다.
  }
}
