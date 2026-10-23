import type { NoteMeta, NotesChangedEvent } from "@shared/types";
import { toast } from "sonner";
import { create } from "zustand";

import { api } from "@/shared/api/handy-api";
import { flushPath } from "@/shared/lib/pending-saves";

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
  activePath: string | null;
  query: string;
  collapsedFolders: Record<string, boolean>;
  /** 디스크에서 바뀐 글을 에디터가 알아챌 수 있게 하는 신호 */
  externalChange: { paths: string[]; seq: number } | null;

  init: () => Promise<() => void>;
  chooseFolder: () => Promise<void>;
  useDefaultFolder: () => Promise<void>;
  refresh: () => Promise<void>;
  openNote: (path: string | null) => Promise<void>;
  openLink: (target: string) => Promise<void>;
  createNote: (folder?: string, title?: string) => Promise<void>;
  renameNote: (path: string, newName: string) => Promise<boolean>;
  removeNote: (path: string) => Promise<void>;
  setQuery: (query: string) => void;
  toggleFolder: (folder: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  async function loadWorkspace(root: string | null) {
    set({ root, notes: [], activePath: null });
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
        void get().refresh();
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

    refresh: async () => {
      try {
        const notes = await api.notes.list();
        set((state) => ({
          notes,
          // 열어 둔 글이 밖에서 지워졌으면 선택을 푼다.
          activePath: state.activePath && notes.some((note) => note.path === state.activePath) ? state.activePath : null,
        }));
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },

    openNote: async (path) => {
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

    createNote: async (folder = "", title) => {
      try {
        await flushPath(get().activePath);
        const meta = await api.notes.create(folder, title);
        await get().refresh();
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
        const meta = await api.notes.rename(path, newName);
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

    setQuery: (query) => set({ query }),

    toggleFolder: (folder) =>
      set((state) => ({ collapsedFolders: { ...state.collapsedFolders, [folder]: !state.collapsedFolders[folder] } })),
  };
});
