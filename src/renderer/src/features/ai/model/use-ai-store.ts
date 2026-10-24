import type { AiEvent, AiStatus, AiTask } from "@shared/ai";
import { toast } from "sonner";
import { create } from "zustand";

import { collectReferences } from "@/entities/note/model/use-reference-store";
import { useEditorBridge, type EditorContext } from "@/entities/note/model/use-editor-bridge";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

export const TASK_LABEL: Record<AiTask, string> = {
  proofread: "맞춤법 교정",
  polish: "다듬기",
  continue: "이어쓰기",
  custom: "지시대로 처리",
  template: "템플릿 블록",
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
  /** 도구를 쓰는 동안의 상태 문구 (예: 웹 검색 중…) */
  status: string;
}

const IDLE_RUN: RunState = { id: null, task: null, phase: "idle", output: "", error: "", context: null, notePath: null, status: "" };

interface AiState {
  status: AiStatus | null;
  rules: string;
  rulesSaved: string;
  instruction: string;
  run: RunState;

  refreshStatus: () => Promise<void>;
  loadRules: () => Promise<void>;
  setRules: (rules: string) => void;
  saveRules: () => Promise<void>;
  setInstruction: (instruction: string) => void;
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

export const useAiStore = create<AiState>((set, get) => ({
  status: null,
  rules: "",
  rulesSaved: "",
  instruction: "",
  run: IDLE_RUN,

  refreshStatus: async () => {
    try {
      set({ status: await api.ai.status() });
    } catch (error) {
      set({ status: { available: false, problem: "error", reason: errorText(error) } });
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
      run: { id, task, phase: "running", output: "", error: "", context, notePath: useWorkspaceStore.getState().activePath, status: "" },
    });

    try {
      const [rules, references] = await Promise.all([api.rules.get(), collectReferences()]);
      await api.ai.run({
        runId: id,
        task,
        rules,
        noteName: context.noteName,
        text: context.text,
        before: context.before,
        instruction,
        templatePrompt: "",
        web: false,
        groundedOnly: false,
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
  } else if (event.type === "status") {
    useAiStore.setState({ run: { ...run, status: event.text } });
  } else if (event.type === "reset") {
    useAiStore.setState({ run: { ...run, output: "" } });
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
