import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BUILTIN_TEMPLATES,
  parseTemplate,
  serializeTemplate,
  slugifyTemplateId,
  type Template,
} from "../shared/templates";
import { resolveInside } from "./notes-fs";

/** 템플릿 파일은 작업 폴더 안에 있어서 git으로 글과 함께 관리된다. */
export const TEMPLATE_DIR = ".handy-writer/templates";

const dirOf = (root: string) => resolveInside(root, TEMPLATE_DIR);

/** `id`가 파일 이름으로 안전한지 (경로 조각이 섞이면 거부한다) */
function assertSafeId(id: string) {
  if (!id || id !== slugifyTemplateId(id) || id.startsWith(".")) throw new Error(`올바르지 않은 템플릿 이름이에요: ${id}`);
}

/** 사용자 파일을 읽고, 같은 id의 내장 템플릿이 있으면 사용자 파일이 대신한다. 내장은 파일이 없어도 보인다. */
export async function listTemplates(root: string): Promise<Template[]> {
  const dir = dirOf(root);
  const files = await readdir(dir).catch(() => [] as string[]);
  const builtinIds = new Set(BUILTIN_TEMPLATES.map((t) => t.id));

  const user: Template[] = [];
  for (const file of files) {
    if (!file.endsWith(".md") || file.startsWith(".")) continue;
    const id = file.slice(0, -3);
    const raw = await readFile(join(dir, file), "utf8").catch(() => null);
    if (raw === null) continue;
    const parsed = parseTemplate(id, raw);
    user.push(builtinIds.has(id) ? { ...parsed, builtin: true, customized: true } : parsed);
  }

  const overridden = new Set(user.map((t) => t.id));
  const all = [...BUILTIN_TEMPLATES.filter((t) => !overridden.has(t.id)), ...user];
  return all.sort((a, b) => Number(Boolean(b.builtin)) - Number(Boolean(a.builtin)) || a.name.localeCompare(b.name, "ko"));
}

async function exists(path: string) {
  return stat(path).then(() => true, () => false);
}

export async function saveTemplate(root: string, input: Template): Promise<Template> {
  const name = input.name.trim();
  if (!name) throw new Error("템플릿 이름을 입력해 주세요.");
  if (!input.prompt.trim()) throw new Error("사전 프롬프트를 입력해 주세요.");

  const dir = dirOf(root);
  await mkdir(dir, { recursive: true });

  let id = input.id;
  if (id) {
    assertSafeId(id);
  } else {
    // 새 템플릿: 이름으로 파일 이름을 만들고, 겹치면 번호를 붙인다.
    const base = slugifyTemplateId(name) || "템플릿";
    id = base;
    for (let i = 1; (await exists(join(dir, `${id}.md`))) || BUILTIN_TEMPLATES.some((t) => t.id === id); i++) id = `${base} ${i}`;
  }

  const clean: Template = { ...input, id, name, builtin: undefined, customized: undefined };
  delete clean.builtin;
  delete clean.customized;
  await writeFile(join(dir, `${id}.md`), serializeTemplate(clean), "utf8");

  const saved = parseTemplate(id, serializeTemplate(clean));
  return BUILTIN_TEMPLATES.some((t) => t.id === id) ? { ...saved, builtin: true, customized: true } : saved;
}

export async function removeTemplate(root: string, id: string) {
  assertSafeId(id);
  await rm(join(dirOf(root), `${id}.md`), { force: true });
}
