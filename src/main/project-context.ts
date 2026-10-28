import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

/** 목록에서 빼는 폴더 (설치한 패키지, 빌드 결과, 캐시) */
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "out", "target", "vendor", "coverage", "__pycache__", "venv", "env",
  "Pods", "DerivedData", "bin", "obj", "tmp", "test-results", "playwright-report",
]);
/** 비밀 값이 들어 있을 수 있어 읽지 않는 파일 */
const SECRET = /(^\.env|\.pem$|\.key$|\.p12$|id_rsa|secret|credential|\.keystore$)/i;
/** 프로젝트를 알아보는 데 먼저 읽는 파일 (위에서부터) */
const KEY_FILES = [
  /^readme(\.\w+)?$/i,
  /^(claude|agents)\.md$/i,
  /^package\.json$/,
  /^(pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod|pubspec\.yaml|build\.gradle(\.kts)?|pom\.xml|gemfile|composer\.json|package\.swift)$/i,
  /^(architecture|contributing|changelog)\.md$/i,
];

const MAX_TREE_ENTRIES = 300;
const MAX_WALK = 5000;
const MAX_FILE_CHARS = 6000;
const MAX_FILES_CHARS = 16_000;

export interface ProjectScan {
  name: string;
  /** 폴더 기준 상대 경로 (폴더는 /로 끝난다). 많으면 앞에서부터 MAX_TREE_ENTRIES개 */
  tree: string[];
  fileCount: number;
  /** 먼저 읽어 둔 파일 */
  files: Array<{ path: string; content: string }>;
}

async function walk(root: string) {
  const entries: string[] = [];
  let fileCount = 0;
  const queue = [root];
  while (queue.length > 0 && entries.length < MAX_WALK) {
    const dir = queue.shift()!;
    const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
    items.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const item of items) {
      if (item.name.startsWith(".") && item.name !== ".github") continue;
      const abs = join(dir, item.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (item.isDirectory()) {
        if (SKIP_DIRS.has(item.name)) continue;
        entries.push(`${rel}/`);
        queue.push(abs);
      } else if (item.isFile()) {
        entries.push(rel);
        fileCount++;
      }
    }
  }
  return { entries, fileCount };
}

/** 프로젝트 폴더를 훑어 파일 목록과 README, 설정 파일 내용을 모은다. */
export async function scanProject(root: string): Promise<ProjectScan> {
  const info = await stat(root).catch(() => null);
  if (!info?.isDirectory()) throw new Error("프로젝트 폴더를 찾지 못했어요.");
  const { entries, fileCount } = await walk(root);

  const top = entries.filter((entry) => !entry.includes("/") || (entry.endsWith("/") && entry.indexOf("/") === entry.length - 1));
  const picked: string[] = [];
  for (const pattern of KEY_FILES) for (const entry of top) if (pattern.test(entry) && !picked.includes(entry)) picked.push(entry);

  let budget = MAX_FILES_CHARS;
  const files: ProjectScan["files"] = [];
  for (const path of picked) {
    if (budget <= 0 || SECRET.test(basename(path))) continue;
    const raw = await readFile(join(root, path), "utf8").catch(() => "");
    if (!raw.trim()) continue;
    const max = Math.min(MAX_FILE_CHARS, budget);
    const content = raw.length > max ? `${raw.slice(0, max)}\n…(이하 생략)` : raw;
    files.push({ path, content });
    budget -= content.length;
  }

  return { name: basename(root), tree: entries.slice(0, MAX_TREE_ENTRIES), fileCount, files };
}

const attr = (value: string) => value.replace(/["<>\n]/g, " ");

/** 프롬프트에 넣을 프로젝트 요약 */
export function projectSection(root: string, scan: ProjectScan) {
  const more = scan.tree.length >= MAX_TREE_ENTRIES ? "\n…(파일이 더 있어요. Glob으로 찾아보세요)" : "";
  const files = scan.files.map((file) => `<file path="${attr(file.path)}">\n${file.content.trim()}\n</file>`).join("\n");
  return [
    `<project name="${attr(scan.name)}" path="${attr(root)}" files="${scan.fileCount}">`,
    `<tree>\n${scan.tree.join("\n")}${more}\n</tree>`,
    files,
    "</project>",
  ]
    .filter(Boolean)
    .join("\n");
}
