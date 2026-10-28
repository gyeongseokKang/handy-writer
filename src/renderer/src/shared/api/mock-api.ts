import type { AiEvent } from "@shared/ai";
import { buildHtmlDocument, exportFileName } from "@shared/export";
import { createLogBook, type LogEntry } from "@shared/log";
import { DEFAULT_GIT_SETTINGS, type GitEvent, type GitSettings, type GitStatus } from "@shared/git";
import { parseNote } from "@shared/note-parser";
import { searchNotes } from "@shared/search";
import { BUILTIN_TEMPLATES } from "@shared/templates";
import { splitFrontmatter } from "@shared/frontmatter";
import type { HandyApi, NoteMeta, NotesChangedEvent } from "@shared/types";

const UNSUPPORTED = { status: "unsupported" as const, reason: "브라우저 미리보기에서는 업데이트를 쓸 수 없어요" };

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
  const logBook = createLogBook();
  const emptyFolders = new Set<string>();
  const logListeners = new Set<(entry: LogEntry) => void>();
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
      folders: async () => {
        const all = new Set(emptyFolders);
        for (const path of files.keys()) {
          const parts = path.split("/").slice(0, -1);
          parts.forEach((_, i) => all.add(parts.slice(0, i + 1).join("/")));
        }
        return [...all].sort();
      },
      createFolder: async (parent, name = "새 폴더") => {
        const path = parent ? `${parent}/${name}` : name;
        emptyFolders.add(path);
        emit();
        return path;
      },
      renameFolder: async (path, newName) => {
        const next = [...path.split("/").slice(0, -1), newName].join("/");
        for (const [file, content] of [...files]) {
          if (!file.startsWith(`${path}/`)) continue;
          files.delete(file);
          files.set(next + file.slice(path.length), content);
        }
        if (emptyFolders.delete(path)) emptyFolders.add(next);
        emit();
        return next;
      },
      removeFolder: async (path) => {
        for (const file of [...files.keys()]) if (file.startsWith(`${path}/`)) files.delete(file);
        emptyFolders.delete(path);
        emit();
      },
      move: async (path, folder) => {
        const next = `${folder ? `${folder}/` : ""}${toMeta(path).name}.md`;
        if (next !== path && files.has(next)) throw new Error("옮길 폴더에 같은 이름의 글이 이미 있어요");
        files.set(next, files.get(path) ?? "");
        if (next !== path) files.delete(path);
        emit(path, next);
        return toMeta(next);
      },
      duplicate: async (path) => {
        const meta = toMeta(path);
        let next = "";
        for (let i = 1; !next || files.has(next); i++) next = `${meta.folder ? `${meta.folder}/` : ""}${meta.name} ${i}.md`;
        files.set(next, files.get(path) ?? "");
        emit(next);
        return toMeta(next);
      },
      reveal: async () => {},
    },
    index: {
      get: async () =>
        [...files.entries()].map(([path, content]) => ({
          path,
          name: toMeta(path).name,
          ...parseNote(content),
        })),
    },
    templates: {
      list: async () => BUILTIN_TEMPLATES,
      save: async (template) => template,
      remove: async () => {},
    },
    update: {
      getState: async () => UNSUPPORTED,
      check: async () => UNSUPPORTED,
      install: async () => {},
      onState: () => () => {},
    },
    spell: { check: async () => ({ status: "offline" as const, typos: [] }) },
    export: {
      // 브라우저 미리보기에서는 파일을 내려받는 것으로 대신한다 (PDF는 만들 수 없다).
      note: async ({ name, format, content }) => {
        if (format === "pdf") throw new Error("브라우저 미리보기에서는 PDF로 내보낼 수 없어요");
        const text = format === "html" ? buildHtmlDocument(name, content) : content;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([text], { type: format === "html" ? "text/html" : "text/markdown" }));
        link.download = exportFileName(name, format);
        link.click();
        URL.revokeObjectURL(link.href);
        return { path: link.download };
      },
      reveal: async () => {},
      copy: async (html, text) => {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      },
    },
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
      // 브라우저 미리보기용: 지금 글에서 문단을 하나씩 뺀 가짜 버전을 만든다.
      history: async (path) => {
        const paragraphs = (files.get(path) ?? "").split(/\n{2,}/).length;
        const count = Math.min(4, Math.max(1, paragraphs - 1));
        return {
          available: true,
          versions: Array.from({ length: count }, (_, i) => ({
            hash: `${"abcdef0123"[i]}`.repeat(40),
            time: Date.now() - (i + 1) * 3_600_000,
            subject: `버전 ${count - i}`,
            author: "미리보기",
            blobPath: `${path}#${paragraphs - 1 - i}`,
          })),
        };
      },
      readVersion: async (_hash, blobPath) => {
        const [path = "", keep = "0"] = blobPath.split("#");
        return (files.get(path) ?? "").split(/\n{2,}/).slice(0, Number(keep)).join("\n\n").replace("오늘은", "어제는");
      },
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
        const result =
          request.task === "continue"
            ? "이어서 쓴 [목업] 문장입니다."
            : request.task === "outline"
              ? "## 들어가며\n- [목업] 글을 쓰는 이유\n## 본론\n- [목업] 핵심 내용\n## 마치며\n- [목업] 정리"
              : request.task === "draft"
                ? "## 들어가며\n\n[목업] 초안 문단입니다.\n\n## 본론\n\n[목업] 본론입니다.\n\n## 마치며\n\n[목업] 정리입니다."
                : request.text.replace(/않계/g, "안 계").replace(/되돌아 왔다/g, "되돌아왔다");
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
    log: {
      list: async () => logBook.list(),
      clear: async () => logBook.clear(),
      add: async (input) => {
        const entry = logBook.add(input);
        if (entry) logListeners.forEach((listener) => listener(entry));
      },
      reveal: async () => {},
      onEntry: (listener) => {
        logListeners.add(listener);
        return () => logListeners.delete(listener);
      },
    },
    onNotesChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
