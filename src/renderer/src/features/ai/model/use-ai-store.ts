import type { AiEvent, AiStatus, AiTask } from "@shared/ai";
import { extractContinuation, parseRevision } from "@shared/ai-prompt";
import { toast } from "sonner";
import { create } from "zustand";

import { collectReferences } from "@/entities/note/model/use-reference-store";
import { useEditorBridge, type EditorContext } from "@/entities/note/model/use-editor-bridge";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

import { addHistory, loadHistory, saveHistory, type AiHistoryItem } from "./ai-history";

export const TASK_LABEL: Record<AiTask, string> = {
  proofread: "맞춤법 교정",
  polish: "다듬기",
  revise: "퇴고",
  continue: "이어쓰기",
  custom: "지시대로 처리",
  template: "템플릿 블록",
  outline: "목차 만들기",
  draft: "초안 쓰기",
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
  /** 요청할 때의 추가 요청 (기록에 남긴다) */
  instruction: string;
  /** 받은 글 그대로 (이어쓰기는 <continuation>, 퇴고는 <revised> 안만 output으로 보여 준다) */
  raw: string;
  /** 퇴고: 무엇을 왜 고쳤는지 */
  notes: string[];
}

const IDLE_RUN: RunState = { id: null, task: null, phase: "idle", output: "", error: "", context: null, notePath: null, status: "", instruction: "", raw: "", notes: [] };

interface AiState {
  status: AiStatus | null;
  rules: string;
  rulesSaved: string;
  /** 퇴고 룰 (비어 있으면 기본 퇴고 기준을 쓴다) */
  reviseRules: string;
  reviseRulesSaved: string;
  instruction: string;
  run: RunState;
  /** 끝난 결과 기록 (최근 것이 앞, 작업 폴더마다 따로) */
  history: AiHistoryItem[];
  historyRoot: string | null;

  /** 작업 폴더가 바뀌면 그 폴더의 기록을 읽는다. */
  loadHistory: (root: string | null) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  /** 기록의 결과를 지금 글의 커서 아래에 넣는다. */
  insertHistory: (id: string) => void;
  refreshStatus: () => Promise<void>;
  loadRules: () => Promise<void>;
  setRules: (rules: string) => void;
  saveRules: () => Promise<void>;
  setReviseRules: (rules: string) => void;
  saveReviseRules: () => Promise<void>;
  setInstruction: (instruction: string) => void;
  start: (task: AiTask) => Promise<void>;
  cancel: () => Promise<void>;
  apply: (mode: "replace" | "below" | "cursor") => void;
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
  reviseRules: "",
  reviseRulesSaved: "",
  instruction: "",
  run: IDLE_RUN,
  history: [],
  historyRoot: null,

  loadHistory: (root) => {
    if (root === get().historyRoot && get().history.length) return;
    set({ history: loadHistory(root), historyRoot: root });
  },
  removeHistory: (id) => {
    const history = get().history.filter((i) => i.id !== id);
    set({ history });
    saveHistory(get().historyRoot, history);
  },
  clearHistory: () => {
    set({ history: [] });
    saveHistory(get().historyRoot, []);
  },
  insertHistory: (id) => {
    const item = get().history.find((i) => i.id === id);
    const bridge = useEditorBridge.getState().bridge;
    if (!item) return;
    if (!bridge) return void toast.error("먼저 글을 열어 주세요.");
    bridge.insertBelowCursor(item.output);
  },

  refreshStatus: async () => {
    try {
      set({ status: await api.ai.status() });
    } catch (error) {
      set({ status: { available: false, problem: "error", reason: errorText(error) } });
    }
  },

  loadRules: async () => {
    try {
      const [rules, reviseRules] = await Promise.all([api.rules.get(), api.rules.getRevise()]);
      set({ rules, rulesSaved: rules, reviseRules, reviseRulesSaved: reviseRules });
    } catch (error) {
      toast.error(`글쓰기 룰을 읽지 못했어요: ${errorText(error)}`);
    }
  },

  setRules: (rules) => set({ rules }),
  setReviseRules: (reviseRules) => set({ reviseRules }),

  saveReviseRules: async () => {
    try {
      await api.rules.setRevise(get().reviseRules);
      set({ reviseRulesSaved: get().reviseRules });
      toast.success("퇴고 룰을 저장했어요.");
    } catch (error) {
      toast.error(`퇴고 룰을 저장하지 못했어요: ${errorText(error)}`);
    }
  },

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
    if (task !== "continue" && !context.text.trim()) return void toast.error(task === "revise" ? "퇴고할 글이 비어 있어요." : "다듬거나 교정할 글이 비어 있어요.");

    const id = crypto.randomUUID();
    set({
      run: { id, task, phase: "running", output: "", error: "", context, notePath: useWorkspaceStore.getState().activePath, status: "", instruction, raw: "", notes: [] },
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
        after: context.after,
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
    if (mode === "cursor") {
      if (bridge.appendAtCursor(run.context, run.output) === "changed") {
        return void toast.error("요청한 뒤에 커서 앞의 글이 바뀌어서 붙이지 않았어요. 결과를 복사하거나 아래에 삽입해 주세요.");
      }
    } else if (mode === "below") {
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
    // 이어쓰기는 받은 글 전체(raw)를 두고, 화면에는 <continuation> 안의 글만 보여 준다.
    const raw = run.raw + event.text;
    const output = run.task === "continue" ? extractContinuation(raw, { streaming: true }) : run.task === "revise" ? parseRevision(raw, { streaming: true }).revised : raw;
    useAiStore.setState({ run: { ...run, raw, output } });
  } else if (event.type === "status") {
    useAiStore.setState({ run: { ...run, status: event.text } });
  } else if (event.type === "reset") {
    useAiStore.setState({ run: { ...run, output: "", raw: "", notes: [] } });
  } else if (event.type === "done") {
    const revision = run.task === "revise" ? parseRevision(event.text) : null;
    const output = tidyOutput(run.task === "continue" ? extractContinuation(event.text) : revision ? revision.revised : event.text);
    const notes = revision?.notes ?? [];
    useAiStore.setState({ run: { ...run, phase: "done", output, notes } });
    // 적용하거나 닫으면 결과가 사라지므로, 끝나는 대로 기록에 남긴다.
    const { history, historyRoot } = useAiStore.getState();
    const next = addHistory(history, {
      id: run.id!, task: run.task!, output, notePath: run.notePath, noteName: run.context?.noteName ?? "", instruction: run.instruction, at: new Date().toISOString(), ...(notes.length ? { notes } : {}),
    });
    useAiStore.setState({ history: next });
    saveHistory(historyRoot, next);
  } else {
    useAiStore.setState({ run: { ...run, phase: "error", error: event.message } });
  }
}

/** 메인 프로세스가 보내는 AI 결과 조각을 받는다. 해제 함수를 돌려준다. */
export function startAiSync() {
  return api.ai.onEvent(handleEvent);
}
