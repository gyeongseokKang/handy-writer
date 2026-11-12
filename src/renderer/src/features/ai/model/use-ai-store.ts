import type { AiEvent, AiStatus, AiTask } from "@shared/ai";
import { extractContinuation, parseRevision } from "@shared/ai-prompt";
import { readNoteReviseRules } from "@shared/note-revise-rules";
import { mergeRanges, parseParts, partsText, spliceParts, stripPartTags, type TextRange } from "@shared/revise-parts";
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

/** setup: 퇴고할 부분을 고르는 중 (아직 요청 전) */
type Phase = "idle" | "setup" | "running" | "done" | "error";

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
  /** 퇴고: 무엇을 왜 고쳤는지 (`원문 → 수정 / 이유`) */
  notes: string[];
  /** 퇴고: 고치지 않고 제안만 한 것 */
  suggestions: string[];
  /** 퇴고: 글 전체가 아니라 고른 부분만 보냈을 때 그 범위들 (context.text 기준) */
  ranges: TextRange[] | null;
  /** 요청을 보낸 시각 (걸린 시간 표시) */
  startedAt: number;
}

const IDLE_RUN: RunState = { id: null, task: null, phase: "idle", output: "", error: "", context: null, notePath: null, status: "", instruction: "", raw: "", notes: [], suggestions: [], ranges: null, startedAt: 0 };

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
  /** 퇴고: 선택한 글이 있으면 바로 시작하고, 없으면 퇴고할 부분을 고르는 화면을 연다. */
  prepare: (task: "revise") => void;
  /**
   * ranges: 퇴고에서 고른 부분들 (없으면 선택 부분이나 글 전체)
   * instruction: 이번에만 덧붙일 한 줄 요청 (주지 않으면 패널의 지시 입력칸)
   */
  start: (task: AiTask, options?: { ranges?: TextRange[]; instruction?: string }) => Promise<void>;
  cancel: () => Promise<void>;
  /** text를 주면 결과 대신 그 글을 넣는다 (퇴고에서 고른 수정만 넣을 때) */
  apply: (mode: "replace" | "below" | "cursor", text?: string) => void;
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

  prepare: (task) => {
    if (get().run.phase === "running") return;
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return;
    const context = bridge.getContext();
    if (context.hasSelection) return void get().start(task);
    if (!context.text.trim()) return void toast.error("퇴고할 글이 비어 있어요.");
    set({ run: { ...IDLE_RUN, task, phase: "setup", context, notePath: useWorkspaceStore.getState().activePath } });
  },

  start: async (task, options = {}) => {
    const picked = options.ranges;
    if (get().run.phase === "running") return;
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return;
    const instruction = options.instruction ?? get().instruction;
    // 부분을 고르던 화면에서 시작하면 그때 읽은 글을 쓴다 (고른 범위가 그 글 기준이다).
    const setup = get().run.phase === "setup" && get().run.task === task ? get().run.context : null;
    const context = setup ?? bridge.getContext();
    const ranges = task === "revise" && picked?.length ? mergeRanges(context.text, picked) : null;

    if (task === "custom" && !instruction.trim()) return void toast.error("어떻게 처리할지 지시를 입력해 주세요.");
    if (task !== "continue" && !context.text.trim()) return void toast.error(task === "revise" ? "퇴고할 글이 비어 있어요." : "다듬거나 교정할 글이 비어 있어요.");

    const id = crypto.randomUUID();
    set({
      run: { id, task, phase: "running", output: "", error: "", context, notePath: useWorkspaceStore.getState().activePath, status: "", instruction, raw: "", notes: [], suggestions: [], ranges, startedAt: Date.now() },
    });

    try {
      const [rules, references] = await Promise.all([api.rules.get(), collectReferences()]);
      await api.ai.run({
        runId: id,
        task,
        rules,
        noteName: context.noteName,
        text: ranges ? partsText(context.text, ranges) : context.text,
        before: context.before,
        after: context.after,
        instruction,
        // 이 글에만 적용하는 퇴고 룰 (글 속성 revise_rules)
        ...(task === "revise" ? { noteReviseRules: readNoteReviseRules(bridge.getFrontmatter()), partial: !!ranges } : {}),
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

  apply: (mode, text) => {
    const { run } = get();
    const bridge = useEditorBridge.getState().bridge;
    const output = text ?? run.output;
    if (run.phase !== "done" || !run.context || !bridge) return;
    if (run.notePath !== useWorkspaceStore.getState().activePath) {
      return void toast.error("다른 글로 옮겨가서 적용할 수 없어요. 결과를 복사해서 붙여넣어 주세요.");
    }
    if (mode === "cursor") {
      if (bridge.appendAtCursor(run.context, output) === "changed") {
        return void toast.error("요청한 뒤에 커서 앞의 글이 바뀌어서 붙이지 않았어요. 결과를 복사하거나 아래에 삽입해 주세요.");
      }
    } else if (mode === "below") {
      bridge.insertBelowCursor(output);
    } else if (bridge.replace(run.context, output) === "changed") {
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
    const output = run.task === "continue" ? extractContinuation(raw, { streaming: true }) : run.task === "revise" ? stripPartTags(parseRevision(raw, { streaming: true }).revised) : raw;
    useAiStore.setState({ run: { ...run, raw, output } });
  } else if (event.type === "status") {
    useAiStore.setState({ run: { ...run, status: event.text } });
  } else if (event.type === "reset") {
    useAiStore.setState({ run: { ...run, output: "", raw: "", notes: [], suggestions: [] } });
  } else if (event.type === "done") {
    const revision = run.task === "revise" ? parseRevision(event.text) : null;
    // 고른 부분만 퇴고했으면 고친 부분들을 원문 자리에 끼워 글 전체로 만든다.
    if (revision && run.ranges && run.context) {
      const parts = parseParts(revision.revised, run.ranges.length);
      if (!parts) {
        useAiStore.setState({ run: { ...run, phase: "error", error: "고른 부분마다 고친 글을 나눠 받지 못했어요. 다시 해 보거나 범위를 줄여 주세요." } });
        return;
      }
      revision.revised = spliceParts(run.context.text, run.ranges, parts);
    }
    const output = tidyOutput(run.task === "continue" ? extractContinuation(event.text) : revision ? revision.revised : event.text);
    const notes = revision?.notes ?? [];
    const suggestions = revision?.suggestions ?? [];
    useAiStore.setState({ run: { ...run, phase: "done", output, notes, suggestions } });
    // 적용하거나 닫으면 결과가 사라지므로, 끝나는 대로 기록에 남긴다.
    const { history, historyRoot } = useAiStore.getState();
    const next = addHistory(history, {
      id: run.id!, task: run.task!, output, notePath: run.notePath, noteName: run.context?.noteName ?? "", instruction: run.instruction, at: new Date().toISOString(), ...(notes.length ? { notes } : {}), ...(suggestions.length ? { suggestions } : {}),
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
