import type { AiEvent } from "@shared/ai";
import { EMPTY_BRIEF, tidyDraftOutput, type DraftBrief } from "@shared/draft";
import { youtubeVideoId, type DraftSource } from "@shared/draft-sources";
import { toast } from "sonner";
import { create } from "zustand";

import { collectReferences } from "@/entities/note/model/use-reference-store";
import { api } from "@/shared/api/handy-api";

export type DraftStep = "brief" | "outline" | "draft";
type Phase = "idle" | "running" | "done" | "error";

interface DraftState {
  step: DraftStep;
  brief: DraftBrief;
  /** AI가 만든 목차. 사용자가 고칠 수 있다. */
  outline: string;
  draft: string;
  /** 붙인 자료 (유튜브 자막, 프로젝트 폴더) */
  sources: DraftSource[];
  /** 불러오는 중인 유튜브 주소 */
  loading: string[];
  phase: Phase;
  /** AI가 도구를 쓰는 동안의 상태 ("프로젝트 파일 읽는 중…") */
  status: string;
  runId: string | null;
  /** 실행 중인 작업 (목차 / 초안) */
  task: "outline" | "draft" | null;
  error: string;

  setStep: (step: DraftStep) => void;
  setBrief: (patch: Partial<DraftBrief>) => void;
  setOutline: (outline: string) => void;
  /** 유튜브 주소로 영상 자막을 불러와 자료에 붙인다. 주제가 비어 있으면 영상 제목으로 채운다. */
  addYoutube: (url: string) => Promise<void>;
  /** 폴더 선택 창으로 프로젝트 폴더를 골라 자료에 붙인다. */
  addProject: () => Promise<void>;
  removeSource: (index: number) => void;
  generate: (task: "outline" | "draft") => Promise<void>;
  cancel: () => Promise<void>;
  /** 입력값까지 모두 지우고 처음부터 */
  reset: () => void;
}

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

const IDLE = { phase: "idle" as Phase, runId: null, task: null, error: "", status: "" };

const sourceKey = (source: DraftSource) => (source.kind === "youtube" ? `youtube:${source.videoId}` : `project:${source.path}`);

/** 초안 만들기 창의 상태. 창을 닫았다 열어도 입력한 기본정보와 목차가 남는다. */
export const useDraftRun = create<DraftState>((set, get) => ({
  step: "brief",
  brief: EMPTY_BRIEF,
  outline: "",
  draft: "",
  sources: [],
  loading: [],
  ...IDLE,

  setStep: (step) => set({ step }),
  setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),
  setOutline: (outline) => set({ outline }),

  addYoutube: async (url) => {
    const id = youtubeVideoId(url);
    if (!id) return void toast.error("유튜브 영상 주소가 아니에요.");
    const { sources, loading } = get();
    if (sources.some((source) => source.kind === "youtube" && source.videoId === id) || loading.includes(id)) return;
    set({ loading: [...loading, id] });
    try {
      const video = await api.sources.youtube(url);
      set((s) => ({
        sources: s.sources.some((source) => sourceKey(source) === sourceKey(video)) ? s.sources : [...s.sources, video],
        brief: s.brief.topic.trim() ? s.brief : { ...s.brief, topic: video.title },
      }));
      if (!video.transcript) toast.info("자막이 없는 영상이라 제목과 설명만 참고해요.");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      set((s) => ({ loading: s.loading.filter((item) => item !== id) }));
    }
  },

  addProject: async () => {
    try {
      const project = await api.sources.pickProject();
      if (project) set((s) => ({ sources: s.sources.some((source) => sourceKey(source) === sourceKey(project)) ? s.sources : [...s.sources, project] }));
    } catch (error) {
      toast.error(errorText(error));
    }
  },

  removeSource: (index) => set((s) => ({ sources: s.sources.filter((_, i) => i !== index) })),

  generate: async (task) => {
    if (get().phase === "running") return;
    const { brief, outline, sources } = get();
    const runId = crypto.randomUUID();
    set({ ...IDLE, phase: "running", runId, task, step: task, ...(task === "outline" ? { outline: "" } : { draft: "" }) });
    try {
      const [rules, references] = await Promise.all([api.rules.get(), collectReferences()]);
      await api.ai.run({
        runId,
        task,
        rules,
        noteName: brief.topic.trim(),
        text: "",
        before: "",
        instruction: "",
        templatePrompt: "",
        web: false,
        groundedOnly: false,
        references,
        brief,
        outline,
        sources,
      });
    } catch (error) {
      if (get().runId === runId) set({ phase: "error", error: errorText(error) });
    }
  },

  cancel: async () => {
    const { runId, phase } = get();
    if (runId && phase === "running") await api.ai.cancel(runId);
  },

  reset: () => set({ step: "brief", brief: EMPTY_BRIEF, outline: "", draft: "", sources: [], ...IDLE }),
}));

function handleEvent(event: AiEvent) {
  const state = useDraftRun.getState();
  if (event.runId !== state.runId) return;
  const field = state.task === "draft" ? "draft" : "outline";
  if (event.type === "delta") useDraftRun.setState({ [field]: state[field] + event.text, status: "" });
  else if (event.type === "reset") useDraftRun.setState({ [field]: "" });
  else if (event.type === "status") useDraftRun.setState({ status: event.text });
  else if (event.type === "done") useDraftRun.setState({ phase: "done", [field]: tidyDraftOutput(event.text) });
  else if (event.type === "error") useDraftRun.setState({ phase: "error", error: event.message });
}

/** 메인 프로세스가 보내는 AI 결과 조각을 받는다. 해제 함수를 돌려준다. */
export function startDraftRunSync() {
  return api.ai.onEvent(handleEvent);
}
