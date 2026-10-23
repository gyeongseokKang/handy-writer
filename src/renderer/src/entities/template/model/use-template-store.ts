import type { Template } from "@shared/templates";
import { toast } from "sonner";
import { create } from "zustand";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

interface TemplateState {
  templates: Template[];
  load: () => Promise<void>;
  /** 저장하고 저장된 템플릿을 돌려준다. 실패하면 null */
  save: (template: Template) => Promise<Template | null>;
  remove: (id: string) => Promise<boolean>;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  templates: [],

  load: async () => {
    if (!useWorkspaceStore.getState().root) return set({ templates: [] });
    try {
      set({ templates: await api.templates.list() });
    } catch (error) {
      toast.error(`템플릿을 읽지 못했어요: ${errorText(error)}`);
    }
  },

  save: async (template) => {
    try {
      const saved = await api.templates.save(template);
      await get().load();
      return saved;
    } catch (error) {
      toast.error(errorText(error));
      return null;
    }
  },

  remove: async (id) => {
    try {
      await api.templates.remove(id);
      await get().load();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  },
}));

/** 작업 폴더가 정해지거나 바뀔 때, 그리고 창이 다시 포커스를 받을 때(다른 프로그램에서 템플릿 파일을 고쳤을 수 있다) 다시 읽는다. */
export function startTemplateSync() {
  const reload = () => void useTemplateStore.getState().load();
  const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
    if (state.root !== prev.root) reload();
  });
  window.addEventListener("focus", reload);
  reload();
  return () => {
    unsubscribe();
    window.removeEventListener("focus", reload);
  };
}
