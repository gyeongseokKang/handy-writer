import type { AiEvent } from "@shared/ai";
import { renderTemplatePrompt, type ContextScope, type Template } from "@shared/templates";
import { create } from "zustand";

import { useEditorBridge } from "@/entities/note/model/use-editor-bridge";
import { collectReferences } from "@/entities/note/model/use-reference-store";
import { api } from "@/shared/api/handy-api";

type Phase = "idle" | "running" | "done" | "error";

export interface TemplateRunArgs {
  template: Template;
  inputs: Record<string, string>;
  extra: string;
  scope: ContextScope;
  web: boolean;
}

interface RunState {
  phase: Phase;
  runId: string | null;
  output: string;
  /** 도구를 쓰는 동안의 상태 문구 (웹 검색 중…) */
  status: string;
  error: string;
  start: (args: TemplateRunArgs) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** 앞뒤 빈 줄을 걷어 내고, AI가 전체를 코드 블록으로 감싸서 보냈으면 벗긴다. */
export function tidyTemplateOutput(text: string) {
  const trimmed = text.replace(/^\s*\n/, "").replace(/\s+$/, "");
  const fenced = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(trimmed);
  return fenced ? (fenced[1] ?? "") : trimmed;
}

const IDLE = { phase: "idle" as Phase, runId: null, output: "", status: "", error: "" };

export const useTemplateRun = create<RunState>((set, get) => ({
  ...IDLE,

  start: async ({ template, inputs, extra, scope, web }) => {
    if (get().phase === "running") return;
    const bridge = useEditorBridge.getState().bridge;
    if (!bridge) return;

    const runId = crypto.randomUUID();
    set({ ...IDLE, phase: "running", runId });
    try {
      const [rules, references] = await Promise.all([api.rules.get(), collectReferences()]);
      await api.ai.run({
        runId,
        task: "template",
        rules,
        noteName: bridge.getContext().noteName,
        text: bridge.getTemplateContext(scope),
        before: "",
        instruction: extra,
        templatePrompt: renderTemplatePrompt(template, inputs),
        web: web && !template.referencesOnly,
        groundedOnly: template.referencesOnly,
        references,
      });
    } catch (error) {
      if (get().runId === runId) set({ phase: "error", error: errorText(error) });
    }
  },

  cancel: async () => {
    const { runId, phase } = get();
    if (runId && phase === "running") await api.ai.cancel(runId);
  },

  reset: () => set({ ...IDLE }),
}));

function handleEvent(event: AiEvent) {
  const state = useTemplateRun.getState();
  if (event.runId !== state.runId) return;
  if (event.type === "delta") useTemplateRun.setState({ output: state.output + event.text, status: "" });
  else if (event.type === "status") useTemplateRun.setState({ status: event.text });
  else if (event.type === "reset") useTemplateRun.setState({ output: "" });
  else if (event.type === "done") useTemplateRun.setState({ phase: "done", output: tidyTemplateOutput(event.text), status: "" });
  else useTemplateRun.setState({ phase: "error", error: event.message, status: "" });
}

/** 메인 프로세스가 보내는 AI 결과 조각을 받는다. 해제 함수를 돌려준다. */
export function startTemplateRunSync() {
  return api.ai.onEvent(handleEvent);
}
