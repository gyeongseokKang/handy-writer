import type { AiEvent, AiStatus, AiTask } from "@shared/ai";
import { splitFrontmatter } from "@shared/frontmatter";
import { toast } from "sonner";
import { create } from "zustand";

import { outgoingOf } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useEditorBridge, type EditorContext } from "@/entities/note/model/use-editor-bridge";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

const MAX_REFERENCES = 5;

export const TASK_LABEL: Record<AiTask, string> = {
  proofread: "맞춤법 교정",
  polish: "다듬기",
  continue: "이어쓰기",
  custom: "지시대로 처리",
};

type Phase = "idle" | "running" | "done" | "error";

interface RunState {
  id: string | null;
  task: AiTask | null;
  phase: Phase;
  output: string;
  error: string;
  /** 요청할 때의 선택 범위와 원문 */
  context: EditorContext | null;
  /** 요청한 글. 다른 글로 옮겨가면 적용하지 않는다. */
  notePath: string | null;
}

const IDLE_RUN: RunState = { id: null, task: null, phase: "idle", output: "", error: "", context: null, notePath: null };

interface AiState {
  status: AiStatus | null;
  rules: string;
  rulesSaved: string;
  instruction: string;
  referencePaths: string[];
  includeLinked: boolean;
  run: RunState;

  refreshStatus: () => Promise<void>;
  loadRules: () => Promise<void>;
  setRules: (rules: string) => void;
  saveRules: () => Promise<void>;
  setInstruction: (instruction: string) => void;
  addReference: (path: string) => void;
  removeReference: (path: string) => void;
  setIncludeLinked: (value: boolean) => void;
  start: (task: AiTask) => Promise<void>;
  cancel: () => Promise<void>;
  apply: (mode: "replace" | "below") => void;
  dismiss: () => void;
}

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** 위치와 상관없이 앞뒤의 빈 줄만 걷어 낸다. 들여쓰기는 마크다운 의미가 있어서 건드리지 않는다. */
export function tidyOutput(text: string) {
  return text.replace(/^\s*\n/, "").replace(/\s+$/, "");
}

async function collectReferences(extraPaths: string[]) {
  const { notes, activePath } = useWorkspaceStore.getState();
  const { entries } = useNoteIndexStore.getState();
  const paths = [...extraPaths];
  if (useAiStore.getState().includeLinked && activePath) {
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

export const useAiStore = create<AiState>((set, get) => ({
  status: null,
  rules: "",
  rulesSaved: "",
  instruction: "",
  referencePaths: [],
  includeLinked: false,
  run: IDLE_RUN,

  refreshStatus: async () => {
    try {
      set({ status: await api.ai.status() });
    } catch (error) {
      set({ status: { available: false, reason: errorText(error) } });
    }
  },

  loadRules: async () => {
    try {
      const rules = await api.rules.get();
      set({ rules, rulesSaved: rules });
    } catch (error) {
      toast.error(`글쓰기 룰을 읽지 못했어요: ${errorText(error)}`);
    }
  },

  setRules: (rules) => set({ rules }),

  saveRules: async () => {
    try {
      await api.rules.set(get().rules);
      set({ rulesSaved: get().rules });
      toast.success("글쓰기 룰을 저장했어요.");
    } catch (error) {
      toast.error(`글쓰기 룰을 저장하지 못했어요: ${errorText(error)}`);
    }
  },

  setInstruction: (instruction) => set({ instruction }),
  addReference: (path) => set((s) => ({ referencePaths: s.referencePaths.includes(path) ? s.referencePaths : [...s.referencePaths, path] })),
  removeReference: (path) => set((s) => ({ referencePaths: s.referencePaths.filter((p) => p !== path) })),
  setIncludeLinked: (includeLinked) => set({ includeLinked }),

  start: async (task) => {
    if (get().run.phase === "running") return;
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return;
    const { instruction } = get();
    const context = bridge.getContext();

    if (task === "custom" && !instruction.trim()) return void toast.error("어떻게 처리할지 지시를 입력해 주세요.");
    if (task !== "continue" && !context.text.trim()) return void toast.error("다듬거나 교정할 글이 비어 있어요.");

    const id = crypto.randomUUID();
    set({
      run: { id, task, phase: "running", output: "", error: "", context, notePath: useWorkspaceStore.getState().activePath },
    });

    try {
      const [rules, references] = await Promise.all([api.rules.get(), collectReferences(get().referencePaths)]);
      await api.ai.run({
        runId: id,
        task,
        rules,
        noteName: context.noteName,
        text: context.text,
        before: context.before,
        instruction,
        references,
      });
    } catch (error) {
      if (get().run.id === id) set((s) => ({ run: { ...s.run, phase: "error", error: errorText(error) } }));
    }
  },

  cancel: async () => {
    const { id, phase } = get().run;
    if (id && phase === "running") await api.ai.cancel(id);
  },

  apply: (mode) => {
    const { run } = get();
    const bridge = useEditorBridge.getState().bridge;
    if (run.phase !== "done" || !run.context || !bridge) return;
    if (run.notePath !== useWorkspaceStore.getState().activePath) {
      return void toast.error("다른 글로 옮겨가서 적용할 수 없어요. 결과를 복사해서 붙여넣어 주세요.");
    }
    if (mode === "below") {
      bridge.insertBelowCursor(run.output);
    } else if (bridge.replace(run.context, run.output) === "changed") {
      return void toast.error("요청한 뒤에 그 부분이 바뀌어서 적용하지 않았어요. 결과를 복사하거나 아래에 삽입해 주세요.");
    }
    set({ run: IDLE_RUN });
  },

  dismiss: () => set({ run: IDLE_RUN }),
}));

function handleEvent(event: AiEvent) {
  const { run } = useAiStore.getState();
  if (event.runId !== run.id) return;
  if (event.type === "delta") {
    useAiStore.setState({ run: { ...run, output: run.output + event.text } });
  } else if (event.type === "done") {
    useAiStore.setState({ run: { ...run, phase: "done", output: tidyOutput(event.text) } });
  } else {
    useAiStore.setState({ run: { ...run, phase: "error", error: event.message } });
  }
}

/** 메인 프로세스가 보내는 AI 결과 조각을 받는다. 해제 함수를 돌려준다. */
export function startAiSync() {
  return api.ai.onEvent(handleEvent);
}
