import type { AiReference } from "@shared/ai";
import { splitFrontmatter } from "@shared/frontmatter";
import { create } from "zustand";

import { outgoingOf } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { api } from "@/shared/api/handy-api";

import { useWorkspaceStore } from "./use-workspace-store";

const MAX_REFERENCES = 5;

interface ReferenceState {
  /** AI가 참고할 글 (사용자가 직접 고른 것) */
  paths: string[];
  /** 현재 글이 링크한 글도 함께 참고할지 */
  includeLinked: boolean;

  add: (path: string) => void;
  remove: (path: string) => void;
  setIncludeLinked: (value: boolean) => void;
}

export const useReferenceStore = create<ReferenceState>((set) => ({
  paths: [],
  includeLinked: false,

  add: (path) => set((s) => ({ paths: s.paths.includes(path) ? s.paths : [...s.paths, path] })),
  remove: (path) => set((s) => ({ paths: s.paths.filter((p) => p !== path) })),
  setIncludeLinked: (includeLinked) => set({ includeLinked }),
}));

/** 고른 글(과 링크한 글)의 본문을 읽어서 AI에 보낼 참고 글 목록으로 만든다. 현재 글 자신은 뺀다. */
export async function collectReferences(): Promise<AiReference[]> {
  const { notes, activePath } = useWorkspaceStore.getState();
  const { entries } = useNoteIndexStore.getState();
  const { paths: chosen, includeLinked } = useReferenceStore.getState();

  const paths = [...chosen];
  if (includeLinked && activePath) {
    const entry = entries.find((e) => e.path === activePath);
    if (entry) for (const link of outgoingOf(entries, entry)) if (link.path) paths.push(link.path);
  }
  const unique = [...new Set(paths)].filter((path) => path !== activePath).slice(0, MAX_REFERENCES);
  const references = await Promise.all(
    unique.map(async (path) => {
      const name = notes.find((note) => note.path === path)?.name ?? path;
      const raw = await api.notes.read(path).catch(() => "");
      return { name, content: splitFrontmatter(raw).body };
    }),
  );
  return references.filter((ref) => ref.content.trim() !== "");
}
