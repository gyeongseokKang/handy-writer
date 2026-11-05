import { isAttachmentPath, type AttachmentMeta } from "@shared/attachments";
import type { NoteMeta, NotesChangedEvent } from "@shared/types";
import { syncTitleHeading } from "@shared/title-heading";
import { toast } from "sonner";
import { create } from "zustand";

import { api } from "@/shared/api/handy-api";
import { flushPath } from "@/shared/lib/pending-saves";

import { useFavoritesStore } from "./use-favorites-store";
import { useUiStore } from "./use-ui-store";
import { placeSplit } from "../lib/split";

const LAST_NOTE_KEY = "handy-writer:last-note";
const TABS_KEY = "handy-writer:tabs";
/** 탭이 이보다 많아지면 가장 왼쪽(오래된) 탭부터 닫는다. */
export const MAX_TABS = 20;

function readTabs(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TABS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function rememberTabs(tabs: string[]) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  } catch {
    // 저장소를 못 써도 앱은 동작해야 한다.
  }
}

function readLastNote() {
  try {
    return localStorage.getItem(LAST_NOTE_KEY);
  } catch {
    return null;
  }
}

function rememberNote(path: string | null) {
  try {
    if (path) localStorage.setItem(LAST_NOTE_KEY, path);
    else localStorage.removeItem(LAST_NOTE_KEY);
  } catch {
    // 저장소를 못 써도 앱은 동작해야 한다.
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(error);
}

/** `[[이름#섹션|별칭]]`의 대상에서 노트 이름만 뽑는다. */
export function linkTargetToName(target: string) {
  return target.split("#")[0]?.trim() ?? "";
}

interface WorkspaceState {
  ready: boolean;
  root: string | null;
  notes: NoteMeta[];
  /** 빈 폴더까지 포함한 폴더 (상대 경로) */
  folders: string[];
  /** 작업 폴더 안의 모든 첨부 파일(이미지, 영상 등) */
  attachments: AttachmentMeta[];
  activePath: string | null;
  /** 열어 둔 탭 (글 경로, 왼쪽부터). activePath는 항상 이 안에 있다. */
  tabs: string[];
  /** 가운데 글 오른쪽에 나란히 띄운 글들 (분할 화면, 왼쪽부터 최대 2개 = 최대 3분할). 가운데 글과 같은 글은 띄우지 않는다. */
  splitPaths: string[];
  query: string;
  collapsedFolders: Record<string, boolean>;
  /** 디스크에서 바뀐 글을 에디터가 알아챌 수 있게 하는 신호 */
  externalChange: { paths: string[]; seq: number } | null;

  init: () => Promise<() => void>;
  chooseFolder: () => Promise<void>;
  useDefaultFolder: () => Promise<void>;
  /** 글 목록을 다시 읽는다. 첨부 파일 목록은 `attachments: false`면 건너뛴다 (글만 저장됐을 때). */
  refresh: (options?: { attachments?: boolean }) => Promise<void>;
  /** 글을 연다. 이미 탭에 있으면 그 탭으로, 아니면 지금 탭을 바꾼다. newTab이면 새 탭으로 연다. */
  openNote: (path: string | null, options?: { newTab?: boolean }) => Promise<void>;
  closeTab: (path: string) => Promise<void>;
  /** 마지막으로 닫은 탭을 다시 연다 (그사이 지워진 글은 건너뛴다). */
  reopenClosedTab: () => Promise<void>;
  /** 닫은 탭 (최근 것이 끝) */
  closedTabs: string[];
  /** 탭을 순서대로 옮긴다 (1: 다음, -1: 이전). */
  cycleTab: (step: 1 | -1) => Promise<void>;
  moveTab: (from: number, to: number) => void;
  /**
   * 분할 화면에 글을 띄운다. null이면 분할을 모두 닫는다.
   * at: 띄울 자리(0 = 가운데 글 바로 오른쪽). 없으면 맨 오른쪽. 이미 3분할이면 그 자리(없으면 맨 오른쪽) 글을 바꾼다.
   */
  openSplit: (path: string | null, at?: number) => Promise<void>;
  /** 분할 화면 하나를 닫는다. */
  closeSplit: (path: string) => Promise<void>;
  /** 분할 화면의 글을 가운데로 옮기고, 가운데 글을 그 자리로 보낸다. 경로가 없으면 첫 분할 화면. */
  swapSplit: (path?: string) => Promise<void>;
  openLink: (target: string) => Promise<void>;
  /** content가 있으면 그 내용으로 채운 글을 만든다. */
  createNote: (folder?: string, title?: string, content?: string) => Promise<void>;
  renameNote: (path: string, newName: string) => Promise<boolean>;
  removeNote: (path: string) => Promise<void>;
  /** 글을 다른 폴더로 옮긴다 ("" 이면 맨 위). */
  moveNote: (path: string, folder: string) => Promise<void>;
  duplicateNote: (path: string) => Promise<void>;
  /** 새 폴더를 만들고 경로를 돌려준다. 실패하면 null */
  createFolder: (parent: string) => Promise<string | null>;
  renameFolder: (path: string, newName: string) => Promise<boolean>;
  /** 폴더를 다른 폴더(빈 문자열이면 맨 위) 안으로 옮긴다. */
  moveFolder: (path: string, folder: string) => Promise<boolean>;
  removeFolder: (path: string) => Promise<void>;
  setQuery: (query: string) => void;
  toggleFolder: (folder: string) => void;
}

export { MAX_SPLITS, placeSplit } from "../lib/split";

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  /** 활성 글을 바꾸고 탭 목록을 맞춘다. replaceTab이면 지금 탭 자리에 넣는다. */
  function activate(path: string | null, { replaceTab = true }: { replaceTab?: boolean } = {}) {
    const { tabs, activePath, splitPaths } = get();
    let next = tabs;
    if (path && !tabs.includes(path)) {
      const index = activePath ? tabs.indexOf(activePath) : -1;
      if (index === -1) next = [...tabs, path];
      else if (replaceTab) next = tabs.map((tab, i) => (i === index ? path : tab));
      else next = [...tabs.slice(0, index + 1), path, ...tabs.slice(index + 1)];
      if (next.length > MAX_TABS) next = next.slice(next.length - MAX_TABS);
    }
    rememberNote(path);
    rememberTabs(next);
    // 분할 화면에 띄운 글을 가운데에서 열면 서로 자리를 바꾼다.
    set({ activePath: path, tabs: next, splitPaths: splitPaths.flatMap((p) => (p === path ? (activePath ? [activePath] : []) : [p])) });
  }

  /** 글 경로가 바뀌거나(이동·이름 바꾸기) 사라졌을 때 활성 글, 탭, 분할 화면을 함께 고친다. */
  function remap(map: (path: string) => string | null) {
    useFavoritesStore.getState().remap(map);
    set((state) => {
      const tabs = [...new Set(state.tabs.map(map).filter((p): p is string => p !== null))];
      const activePath = state.activePath ? map(state.activePath) : null;
      let nextActive = activePath;
      if (state.activePath && !activePath) {
        // 지금 탭이 사라졌으면 옆 탭을 연다.
        const index = state.tabs.indexOf(state.activePath);
        const survivors = state.tabs.slice(index + 1).concat(state.tabs.slice(0, index).reverse()).map(map);
        nextActive = survivors.find((p): p is string => p !== null) ?? null;
      }
      const splitPaths = [...new Set(state.splitPaths.map(map))].filter((p): p is string => p !== null && p !== nextActive);
      rememberNote(nextActive);
      rememberTabs(tabs);
      return { activePath: nextActive, tabs, splitPaths };
    });
  }

  async function loadWorkspace(root: string | null) {
    set({ root, notes: [], folders: [], attachments: [], activePath: null, tabs: [], splitPaths: [] });
    useFavoritesStore.getState().load(root);
    if (!root) return;
    await get().refresh();
    const { notes } = get();
    const exists = (path: string | null) => notes.some((note) => note.path === path);
    const last = readLastNote();
    const initial = exists(last) ? last : (notes[0]?.path ?? null);
    const tabs = readTabs().filter(exists);
    set({ tabs: initial && !tabs.includes(initial) ? [...tabs, initial] : tabs, activePath: initial });
  }

  return {
    ready: false,
    root: null,
    notes: [],
    folders: [],
    attachments: [],
    activePath: null,
    tabs: [],
    closedTabs: [],
    splitPaths: [],
    query: "",
    collapsedFolders: {},
    externalChange: null,

    init: async () => {
      try {
        await loadWorkspace((await api.workspace.get()).root);
      } catch (error) {
        toast.error(errorMessage(error));
      }
      set({ ready: true });

      const unsubscribe = api.onNotesChanged((event: NotesChangedEvent) => {
        void get().refresh({ attachments: event.paths.some(isAttachmentPath) });
        set((state) => ({ externalChange: { paths: event.paths, seq: (state.externalChange?.seq ?? 0) + 1 } }));
      });
      return unsubscribe;
    },

    chooseFolder: async () => {
      await flushPath(get().activePath);
      const { root } = await api.workspace.choose();
      if (root && root !== get().root) await loadWorkspace(root);
    },

    useDefaultFolder: async () => {
      const { root } = await api.workspace.useDefault();
      await loadWorkspace(root);
    },

    refresh: async ({ attachments: withAttachments = true } = {}) => {
      const activeBefore = get().activePath;
      try {
        const [notes, folders, attachments] = await Promise.all([
          api.notes.list(),
          api.notes.folders().catch(() => get().folders),
          withAttachments ? api.attachments.list().catch(() => [] as AttachmentMeta[]) : Promise.resolve(null),
        ]);
        set((state) => ({
          notes,
          folders,
          attachments: attachments ?? state.attachments,
          // 열어 둔 글이 밖에서 지워졌으면 선택을 푼다. 읽는 사이에 다른 글로 옮겨 갔으면(이동·이름 바꾸기) 그대로 둔다.
          activePath:
            state.activePath !== activeBefore || (state.activePath && notes.some((note) => note.path === state.activePath)) ? state.activePath : null,
        }));
        // 밖에서 지워진 글은 탭과 분할 화면에서도 닫는다. 활성 글을 푼 경우는 위에서 이미 처리했다.
        const alive = new Set(notes.map((note) => note.path));
        const { tabs, splitPaths, activePath } = get();
        if (tabs.some((tab) => !alive.has(tab) && tab !== activePath) || splitPaths.some((p) => !alive.has(p))) {
          set({ tabs: tabs.filter((tab) => alive.has(tab) || tab === activePath), splitPaths: splitPaths.filter((p) => alive.has(p)) });
        }
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    openNote: async (path, { newTab = false } = {}) => {
      useUiStore.getState().setView("editor");
      const current = get().activePath;
      if (path === current) return;
      await flushPath(current);
      if (get().splitPaths.includes(path ?? "")) await flushPath(path);
      activate(path, { replaceTab: !newTab });
    },

    closeTab: async (path) => {
      await flushPath(path);
      set((state) => ({ closedTabs: [...state.closedTabs.filter((p) => p !== path), path].slice(-MAX_TABS) }));
      remap((p) => (p === path ? null : p));
    },

    reopenClosedTab: async () => {
      const { closedTabs, notes, tabs } = get();
      const alive = new Set(notes.map((note) => note.path));
      const candidates = closedTabs.filter((p) => alive.has(p) && !tabs.includes(p));
      const path = candidates.at(-1);
      set({ closedTabs: closedTabs.filter((p) => p !== path && alive.has(p)) });
      if (path) await get().openNote(path, { newTab: true });
    },

    cycleTab: async (step) => {
      const { tabs, activePath } = get();
      if (tabs.length < 2 || !activePath) return;
      const index = tabs.indexOf(activePath);
      await get().openNote(tabs[(index + step + tabs.length) % tabs.length] ?? null);
    },

    moveTab: (from, to) => {
      const tabs = [...get().tabs];
      const [moved] = tabs.splice(from, 1);
      if (moved === undefined) return;
      tabs.splice(Math.max(0, Math.min(tabs.length, to)), 0, moved);
      rememberTabs(tabs);
      set({ tabs });
    },

    openSplit: async (path, at) => {
      const { splitPaths, activePath } = get();
      if (path === null) {
        await Promise.all(splitPaths.map(flushPath));
        return set({ splitPaths: [] });
      }
      if (path === activePath) {
        toast.info("가운데에 열린 글이라 옆에 같이 띄울 수 없어요. 다른 글을 골라 주세요.");
        return;
      }
      await flushPath(path);
      set({ splitPaths: placeSplit(splitPaths, path, at) });
    },

    closeSplit: async (path) => {
      await flushPath(path);
      set((state) => ({ splitPaths: state.splitPaths.filter((p) => p !== path) }));
    },

    swapSplit: async (path) => {
      const { splitPaths, activePath } = get();
      const target = path ?? splitPaths[0];
      if (!target || !splitPaths.includes(target)) return;
      await Promise.all([flushPath(target), flushPath(activePath)]);
      activate(target);
    },

    openLink: async (target) => {
      const name = linkTargetToName(target);
      if (!name) return;
      const existing = get().notes.find((note) => note.name.toLowerCase() === name.toLowerCase());
      if (existing) return get().openNote(existing.path);
      await get().createNote("", name);
    },

    createNote: async (folder = "", title, content) => {
      try {
        await flushPath(get().activePath);
        const meta = await api.notes.create(folder, title);
        // 가져온 글·AI 초안처럼 만들 때 채운 내용은 오늘 쓴 양에 넣지 않는다.
        if (content) await api.notes.write(meta.path, content, { countWriting: false });
        await get().refresh();
        useUiStore.getState().setView("editor");
        activate(meta.path, { replaceTab: false });
        if (folder) set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [folder]: false } }));
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    renameNote: async (path, newName) => {
      try {
        await flushPath(path);
        const oldName = get().notes.find((note) => note.path === path)?.name ?? "";
        const { meta, updatedNotes } = await api.notes.rename(path, newName);
        // 본문 맨 앞의 `# 옛 제목`은 위쪽 제목이 대신 보여 주는 줄이라, 이름을 바꾸면 같이 바꿔서 어긋나지 않게 한다.
        try {
          const next = syncTitleHeading(await api.notes.read(meta.path), oldName, meta.name);
          if (next !== null) await api.notes.write(meta.path, next, { countWriting: false });
        } catch {
          // 제목 줄을 못 고쳐도 이름 바꾸기 자체는 성공이다.
        }
        if (updatedNotes > 0) toast.success(`${updatedNotes}개 글의 링크를 새 이름으로 고쳤어요.`);
        remap((p) => (p === path ? meta.path : p));
        if (get().activePath === null) activate(meta.path);
        await get().refresh();
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      }
    },

    removeNote: async (path) => {
      try {
        await flushPath(path);
        await api.notes.remove(path);
        remap((p) => (p === path ? null : p));
        await get().refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    moveNote: async (path, folder) => {
      try {
        await flushPath(path);
        const meta = await api.notes.move(path, folder);
        remap((p) => (p === path ? meta.path : p));
        if (folder) set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [folder]: false } }));
        await get().refresh({ attachments: false });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    duplicateNote: async (path) => {
      try {
        await flushPath(path);
        const meta = await api.notes.duplicate(path);
        await get().refresh({ attachments: false });
        await get().openNote(meta.path);
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    createFolder: async (parent) => {
      try {
        const path = await api.notes.createFolder(parent);
        if (parent) set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [parent]: false } }));
        await get().refresh({ attachments: false });
        return path;
      } catch (error) {
        toast.error(errorMessage(error));
        return null;
      }
    },

    renameFolder: async (path, newName) => {
      try {
        const { activePath, splitPaths } = get();
        const inside = (p: string) => p === path || p.startsWith(`${path}/`);
        await Promise.all([activePath, ...splitPaths].filter((p): p is string => p !== null && inside(p)).map(flushPath));
        const next = await api.notes.renameFolder(path, newName);
        const moved = (p: string) => (inside(p) ? next + p.slice(path.length) : p);
        remap(moved);
        // 접어 둔 상태도 새 이름으로 옮긴다.
        set((state) => ({ collapsedFolders: Object.fromEntries(Object.entries(state.collapsedFolders).map(([key, value]) => [moved(key), value])) }));
        await get().refresh({ attachments: false });
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      }
    },

    moveFolder: async (path, folder) => {
      try {
        const { activePath, splitPaths } = get();
        const inside = (p: string) => p === path || p.startsWith(`${path}/`);
        await Promise.all([activePath, ...splitPaths].filter((p): p is string => p !== null && inside(p)).map(flushPath));
        const next = await api.notes.moveFolder(path, folder);
        const moved = (p: string) => (inside(p) ? next + p.slice(path.length) : p);
        remap(moved);
        // 접어 둔 상태도 새 자리로 옮기고, 들어간 폴더는 펼쳐서 옮겨진 것이 보이게 한다.
        set((state) => ({
          collapsedFolders: {
            ...Object.fromEntries(Object.entries(state.collapsedFolders).map(([key, value]) => [moved(key), value])),
            ...(folder ? { [folder]: false } : {}),
          },
        }));
        await get().refresh({ attachments: false });
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      }
    },

    removeFolder: async (path) => {
      try {
        const inside = (p: string) => p.startsWith(`${path}/`);
        const { activePath, splitPaths } = get();
        await Promise.all([activePath, ...splitPaths].filter((p): p is string => p !== null && inside(p)).map(flushPath));
        await api.notes.removeFolder(path);
        remap((p) => (inside(p) ? null : p));
        await get().refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    setQuery: (query) => set({ query }),

    toggleFolder: (folder) =>
      set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [folder]: !state.collapsedFolders[folder] } })),
  };
});
