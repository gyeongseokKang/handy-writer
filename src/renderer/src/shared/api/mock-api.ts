import type { AiEvent } from "@shared/ai";
import { DEFAULT_GIT_SETTINGS, type GitEvent, type GitSettings, type GitStatus } from "@shared/git";
import { parseNote } from "@shared/note-parser";
import { searchNotes } from "@shared/search";
import { splitFrontmatter } from "@shared/frontmatter";
import type { HandyApi, NoteMeta, NotesChangedEvent } from "@shared/types";

const SEED: Record<string, string> = {
  "시작하기.md": `---
tags: [가이드]
---

# 시작하기

Handy Writer에 오신 것을 환영해요. \`/\`를 입력하면 블록 메뉴가 열리고, \`[[\`를 입력하면 다른 글을 연결할 수 있어요.

> [!tip] 팁
> 글은 작업 폴더에 \`.md\` 파일로 저장돼서 Obsidian이나 git으로도 그대로 쓸 수 있어요.

- [x] 작업 폴더 선택하기
- [ ] 첫 글 쓰기

다음으로 [[글쓰기 규칙]]을 읽어 보세요.
`,
  "글쓰기 규칙.md": `# 글쓰기 규칙

1. 한 문단에는 한 가지 생각만 담는다.
2. 수식어보다 구체적인 사례를 쓴다.

자세한 내용은 [[시작하기|가이드]]에서 확인하세요.
`,
  "일기/2026-10-23.md": "# 2026-10-23\n\n오늘은 에디터를 골랐다.\n",
};

function toMeta(path: string): NoteMeta {
  const slash = path.lastIndexOf("/");
  return {
    path,
    name: path.slice(slash + 1).replace(/\.md$/, ""),
    folder: slash === -1 ? "" : path.slice(0, slash),
    mtime: Date.now(),
  };
}

export function createMockApi(): HandyApi {
  const files = new Map(Object.entries(SEED));
  const listeners = new Set<(event: NotesChangedEvent) => void>();
  const aiListeners = new Set<(event: AiEvent) => void>();
  let rules = "";
  const gitListeners = new Set<(event: GitEvent) => void>();
  let gitSettings: GitSettings = { ...DEFAULT_GIT_SETTINGS };
  let gitStatus: GitStatus = {
    installed: true,
    isRepo: true,
    branch: "main",
    upstream: "origin/main",
    ahead: 1,
    behind: 0,
    hasRemote: true,
    merging: false,
    changes: [
      { path: "시작하기.md", kind: "modified" },
      { path: "새 아이디어.md", kind: "untracked" },
    ],
    lastCommit: { subject: "handy-writer: 2026-10-22 18:30", time: Date.now() - 3_600_000 },
  };
  const emitGit = () => gitListeners.forEach((listener) => listener({ kind: "status", status: gitStatus }));
  const emit = (...paths: string[]) => listeners.forEach((listener) => listener({ paths }));

  return {
    platform: "mock",
    workspace: {
      get: async () => ({ root: "/mock/HandyWriter" }),
      choose: async () => ({ root: "/mock/HandyWriter" }),
      useDefault: async () => ({ root: "/mock/HandyWriter" }),
    },
    notes: {
      list: async () => [...files.keys()].map(toMeta),
      read: async (path) => {
        const content = files.get(path);
        if (content === undefined) throw new Error(`없는 글이에요: ${path}`);
        return content;
      },
      write: async (path, content) => {
        files.set(path, content);
        emit(path);
      },
      create: async (folder, title) => {
        const prefix = folder ? `${folder}/` : "";
        const base = title || "제목 없음";
        let name = base;
        for (let i = 1; files.has(`${prefix}${name}.md`); i++) name = `${base} ${i}`;
        const path = `${prefix}${name}.md`;
        files.set(path, "");
        emit(path);
        return toMeta(path);
      },
      rename: async (path, newName) => {
        const meta = toMeta(path);
        const next = `${meta.folder ? `${meta.folder}/` : ""}${newName}.md`;
        if (next !== path && files.has(next)) throw new Error(`같은 이름의 글이 이미 있어요: ${newName}`);
        files.set(next, files.get(path) ?? "");
        if (next !== path) files.delete(path);
        emit(path, next);
        return { meta: toMeta(next), updatedNotes: 0 };
      },
      remove: async (path) => {
        files.delete(path);
        emit(path);
      },
    },
    index: {
      get: async () =>
        [...files.entries()].map(([path, content]) => ({
          path,
          name: toMeta(path).name,
          ...parseNote(content),
        })),
    },
    spell: { check: async () => ({ status: "offline" as const, typos: [] }) },
    attachments: {
      list: async () => [],
      pick: async () => ({ imported: [], skipped: [] }),
      save: async (name) => ({ path: `attachments/${name}`, name, kind: "image", size: 0, mtime: Date.now() }),
      reveal: async () => {},
    },
    search: {
      query: async (query) =>
        searchNotes(
          [...files.entries()].map(([path, content]) => ({ path, name: toMeta(path).name, body: splitFrontmatter(content).body, tags: parseNote(content).tags })),
          query,
        ),
    },
    rules: {
      get: async () => rules,
      set: async (content) => {
        rules = content;
      },
    },
    git: {
      status: async () => gitStatus,
      init: async () => gitStatus,
      setRemote: async () => gitStatus,
      commit: async () => {
        const nothing = gitStatus.changes.length === 0;
        gitStatus = { ...gitStatus, changes: [], ahead: nothing ? gitStatus.ahead : gitStatus.ahead + 1 };
        emitGit();
        return nothing ? { outcome: "nothing-to-commit", message: "커밋할 변경이 없어요." } : { outcome: "committed", message: "변경을 커밋했어요." };
      },
      pull: async () => ({ outcome: "up-to-date", message: "이미 최신이에요." }),
      push: async () => {
        gitStatus = { ...gitStatus, ahead: 0 };
        emitGit();
        return { outcome: "pushed", message: "원격 저장소에 올렸어요." };
      },
      sync: async () => {
        gitStatus = { ...gitStatus, changes: [], ahead: 0 };
        emitGit();
        return { outcome: "synced", message: "동기화했어요 (커밋 → 푸시)" };
      },
      getSettings: async () => gitSettings,
      setSettings: async (settings) => (gitSettings = settings),
      onEvent: (listener) => {
        gitListeners.add(listener);
        return () => gitListeners.delete(listener);
      },
    },
    ai: {
      status: async () => ({ available: true, version: "mock", path: "mock" }),
      run: async (request) => {
        const { runId } = request;
        const result = request.task === "continue" ? "이어서 쓴 [목업] 문장입니다." : request.text.replace(/않계/g, "안 계").replace(/되돌아 왔다/g, "되돌아왔다");
        window.setTimeout(() => {
          aiListeners.forEach((listener) => listener({ runId, type: "delta", text: result }));
          aiListeners.forEach((listener) => listener({ runId, type: "done", text: result }));
        }, 300);
        return runId;
      },
      cancel: async () => {},
      onEvent: (listener) => {
        aiListeners.add(listener);
        return () => aiListeners.delete(listener);
      },
    },
    onNotesChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
