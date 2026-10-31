/**
 * 원고: 폴더 하나를 책이나 긴 글 한 편으로 보고, 안의 글을 장(章)으로 묶는다.
 * 장 순서·뺀 장·목표 분량은 작업 폴더의 `.handy-writer/manuscripts.json`에 폴더별로 남겨 git으로 함께 관리한다.
 */

export const MANUSCRIPTS_PATH = ".handy-writer/manuscripts.json";

export interface ManuscriptConfig {
  /** 장 순서 (원고 폴더 기준 상대 경로). 여기 없는 글은 뒤에 이름순으로 붙는다. */
  order: string[];
  /** 원고에서 뺀 글 (원고 폴더 기준 상대 경로) */
  excluded: string[];
  /** 원고 전체 목표 분량 (공백 포함 글자 수) */
  goal: number | null;
}

export type Manuscripts = Record<string, ManuscriptConfig>;

export const EMPTY_MANUSCRIPT: ManuscriptConfig = { order: [], excluded: [], goal: null };

const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** 파일 내용을 읽는다. 모양이 틀린 항목은 버린다. */
export function parseManuscripts(json: string): Manuscripts {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Manuscripts = {};
  for (const [folder, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const config = raw as Record<string, unknown>;
    const goal = typeof config["goal"] === "number" && config["goal"] > 0 ? config["goal"] : null;
    out[folder] = { order: strings(config["order"]), excluded: strings(config["excluded"]), goal };
  }
  return out;
}

export function formatManuscripts(all: Manuscripts) {
  return `${JSON.stringify(all, null, 2)}\n`;
}

/** 원고 폴더 기준 상대 경로 (`책/1장.md`의 원고가 `책`이면 `1장.md`) */
export function relativeTo(folder: string, path: string) {
  return folder ? path.slice(folder.length + 1) : path;
}

const collator = new Intl.Collator("ko", { numeric: true });

/**
 * 원고 폴더 안(하위 폴더 포함)의 글을 장 순서대로 늘어놓는다.
 * 순서에 적힌 글이 먼저, 나머지는 경로의 이름순(숫자는 크기순)으로 뒤에 온다.
 */
export function orderChapters<T extends { path: string }>(folder: string, notes: T[], config: ManuscriptConfig) {
  const prefix = folder ? `${folder}/` : "";
  const inside = notes.filter((note) => note.path.startsWith(prefix));
  const byRelative = new Map(inside.map((note) => [relativeTo(folder, note.path), note]));
  const ordered: T[] = [];
  for (const rel of config.order) {
    const note = byRelative.get(rel);
    if (note) {
      ordered.push(note);
      byRelative.delete(rel);
    }
  }
  const rest = [...byRelative.entries()].sort(([a], [b]) => collator.compare(a, b)).map(([, note]) => note);
  const excluded = new Set(config.excluded);
  return [...ordered, ...rest].map((note) => ({ note, included: !excluded.has(relativeTo(folder, note.path)) }));
}

/** 글·폴더의 경로가 바뀌면 원고 설정의 폴더 이름과 장 경로도 따라 고친다. 바뀐 것이 없으면 null */
export function remapManuscripts(all: Manuscripts, map: (path: string) => string | null): Manuscripts | null {
  let changed = false;
  const out: Manuscripts = {};
  for (const [folder, config] of Object.entries(all)) {
    // 폴더 자체가 옮겨졌는지는 그 안의 가상 경로가 어디로 가는지로 알아낸다.
    const probe = folder ? map(`${folder}/\u0000`) : null;
    const nextFolder = probe?.endsWith("/\u0000") ? probe.slice(0, -2) : folder;
    const fix = (rel: string) => {
      const next = map(folder ? `${folder}/${rel}` : rel);
      if (next === null) return null;
      const prefix = nextFolder ? `${nextFolder}/` : "";
      return next.startsWith(prefix) ? next.slice(prefix.length) : null;
    };
    const order = config.order.map(fix).filter((p): p is string => p !== null);
    const excluded = config.excluded.map(fix).filter((p): p is string => p !== null);
    if (nextFolder !== folder || order.join("\n") !== config.order.join("\n") || excluded.join("\n") !== config.excluded.join("\n")) changed = true;
    out[nextFolder] = { ...config, order, excluded };
  }
  return changed ? out : null;
}

const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** 코드 블록 밖의 줄에만 바꾸기를 적용한다. */
function mapOutsideCode(markdown: string, change: (line: string) => string) {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const match = FENCE.exec(line);
      if (match) {
        const mark = match[1]?.[0] ?? null;
        if (fence === null) fence = mark;
        else if (mark === fence) fence = null;
        return line;
      }
      return fence === null ? change(line) : line;
    })
    .join("\n");
}

/**
 * 장 하나의 각주 이름과 그림·표 ID에 장 번호를 붙여, 여러 장을 합쳐도 서로 겹치지 않게 한다.
 * (`[^1]` → `[^c2-1]`, `^fig-a` → `^fig-a-c2`, `[[#^fig-a]]` → `[[#^fig-a-c2]]`)
 */
export function namespaceChapter(markdown: string, chapter: number) {
  const tag = `c${chapter}`;
  return mapOutsideCode(markdown, (line) =>
    line
      .replace(/\[\^([^\]\s]+)\]/g, (_all, label: string) => `[^${tag}-${label}]`)
      .replace(/(\[\[#\^)([A-Za-z0-9][\w-]*)/g, (_all, open: string, id: string) => `${open}${id}-${tag}`)
      .replace(/(^|\s)\^([A-Za-z0-9][\w-]*)\s*$/, (_all, space: string, id: string) => `${space}^${id}-${tag}`),
  );
}

/** 본문이 1단계 제목(`# …`)으로 시작하는지 (그러면 장 제목을 따로 붙이지 않는다) */
function startsWithTitle(body: string) {
  const first = body.split("\n").find((line) => line.trim() !== "");
  return !!first && /^#[ \t]+\S/.test(first);
}

/** 장들을 하나의 마크다운으로 잇는다. 장마다 1단계 제목이 없으면 글 이름을 제목으로 붙인다. */
export function combineChapters(chapters: { name: string; body: string }[]) {
  return chapters
    .map(({ name, body }, i) => {
      const text = namespaceChapter(body.trim(), i + 1);
      return startsWithTitle(text) ? text : `# ${name}\n\n${text}`.trimEnd();
    })
    .join("\n\n")
    .concat("\n");
}
