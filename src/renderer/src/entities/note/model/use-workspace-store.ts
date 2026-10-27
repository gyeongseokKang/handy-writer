import { isAttachmentPath, type AttachmentMeta } from "@shared/attachments";
import type { NoteMeta, NotesChangedEvent } from "@shared/types";
import { toast } from "sonner";
import { create } from "zustand";

import { api } from "@/shared/api/handy-api";
import { flushPath } from "@/shared/lib/pending-saves";

import { useUiStore } from "./use-ui-store";

const LAST_NOTE_KEY = "handy-writer:last-note";

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
  query: string;
  collapsedFolders: Record<string, boolean>;
  /** 디스크에서 바뀐 글을 에디터가 알아챌 수 있게 하는 신호 */
  externalChange: { paths: string[]; seq: number } | null;

  init: () => Promise<() => void>;
  chooseFolder: () => Promise<void>;
  useDefaultFolder: () => Promise<void>;
  /** 글 목록을 다시 읽는다. 첨부 파일 목록은 `attachments: false`면 건너뛴다 (글만 저장됐을 때). */
  refresh: (options?: { attachments?: boolean }) => Promise<void>;
  openNote: (path: string | null) => Promise<void>;
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
  removeFolder: (path: string) => Promise<void>;
  setQuery: (query: string) => void;
  toggleFolder: (folder: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  async function loadWorkspace(root: string | null) {
    set({ root, notes: [], folders: [], attachments: [], activePath: null });
    if (!root) return;
    await get().refresh();
    const { notes } = get();
    const last = readLastNote();
    const initial = notes.find((note) => note.path === last) ?? notes[0] ?? null;
    set({ activePath: initial?.path ?? null });
  }

  return {
    ready: false,
    root: null,
    notes: [],
    folders: [],
    attachments: [],
    activePath: null,
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
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    openNote: async (path) => {
      useUiStore.getState().setView("editor");
      const current = get().activePath;
      if (path === current) return;
      await flushPath(current);
      rememberNote(path);
      set({ activePath: path });
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
        if (content) await api.notes.write(meta.path, content);
        await get().refresh();
        useUiStore.getState().setView("editor");
        rememberNote(meta.path);
        set({ activePath: meta.path });
        if (folder) set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [folder]: false } }));
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    renameNote: async (path, newName) => {
      try {
        await flushPath(path);
        const { meta, updatedNotes } = await api.notes.rename(path, newName);
        if (updatedNotes > 0) toast.success(`${updatedNotes}개 글의 링크를 새 이름으로 고쳤어요.`);
        await get().refresh();
        if (get().activePath === path || get().activePath === null) {
          rememberNote(meta.path);
          set({ activePath: meta.path });
        }
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
        if (get().activePath === path) {
          rememberNote(null);
          set({ activePath: null });
        }
        await get().refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    moveNote: async (path, folder) => {
      try {
        await flushPath(path);
        const meta = await api.notes.move(path, folder);
        if (get().activePath === path) {
          rememberNote(meta.path);
          set({ activePath: meta.path });
        }
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
        const { activePath } = get();
        const inside = (p: string) => p === path || p.startsWith(`${path}/`);
        if (activePath && inside(activePath)) await flushPath(activePath);
        const next = await api.notes.renameFolder(path, newName);
        const moved = (p: string) => (inside(p) ? next + p.slice(path.length) : p);
        set((state) => ({
          activePath: state.activePath ? moved(state.activePath) : null,
          // 접어 둔 상태도 새 이름으로 옮긴다.
          collapsedFolders: Object.fromEntries(Object.entries(state.collapsedFolders).map(([key, value]) => [moved(key), value])),
        }));
        rememberNote(get().activePath);
        await get().refresh({ attachments: false });
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      }
    },

    removeFolder: async (path) => {
      try {
        const { activePath } = get();
        const inside = activePath !== null && activePath.startsWith(`${path}/`);
        if (inside) await flushPath(activePath);
        await api.notes.removeFolder(path);
        if (inside) {
          rememberNote(null);
          set({ activePath: null });
        }
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
