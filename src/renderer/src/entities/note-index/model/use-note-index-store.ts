import type { NoteIndexEntry } from "@shared/types";
import { createLinkResolver } from "@shared/note-parser";
import { toast } from "sonner";
import { create } from "zustand";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

const RELOAD_DELAY_MS = 200;

interface NoteIndexState {
  entries: NoteIndexEntry[];
  /** `[[링크]]` 대상이 가리키는 글의 경로. 없는 글이면 null */
  resolve: (target: string) => string | null;
  load: () => Promise<void>;
}

export const useNoteIndexStore = create<NoteIndexState>((set) => ({
  entries: [],
  resolve: () => null,
  load: async () => {
    if (!useWorkspaceStore.getState().root) {
      set({ entries: [], resolve: () => null });
      return;
    }
    try {
      const entries = await api.index.get();
      set({ entries, resolve: createLinkResolver(entries) });
    } catch (error) {
      toast.error(`링크 정보를 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
}));

/** 글 목록이 바뀔 때마다(저장, 이름 변경, 외부 변경) 색인을 다시 읽는다. 해제 함수를 돌려준다. */
export function startIndexSync() {
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void useNoteIndexStore.getState().load(), RELOAD_DELAY_MS);
  };
  const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
    if (state.notes !== prev.notes || state.root !== prev.root) schedule();
  });
  schedule();
  return () => {
    window.clearTimeout(timer);
    unsubscribe();
  };
}
