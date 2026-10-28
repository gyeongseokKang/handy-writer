import { DEFAULT_GIT_SETTINGS, type GitChangeKind, type GitEvent, type GitOpResult, type GitSettings, type GitStatus } from "@shared/git";
import { toast } from "sonner";
import { create } from "zustand";

import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";
import { api } from "@/shared/api/handy-api";

const REFRESH_DELAY_MS = 1200;

type Busy = "init" | "remote" | "commit" | "pull" | "push" | "sync" | "force-pull" | "force-push" | null;

interface GitState {
  status: GitStatus | null;
  settings: GitSettings;
  busy: Busy;
  commitMessage: string;
  /** 변경된 글의 경로 → 종류 (사이드바 표시용) */
  changedByPath: Record<string, GitChangeKind>;
  /** 마지막 가져오기·동기화가 충돌로 멈췄으면 true (강제 가져오기·푸시를 보여준다) */
  conflicted: boolean;

  refresh: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<GitSettings>) => Promise<void>;
  setCommitMessage: (message: string) => void;
  init: () => Promise<void>;
  setRemote: (url: string) => Promise<boolean>;
  commit: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  sync: () => Promise<void>;
  forcePull: () => Promise<void>;
  forcePush: () => Promise<void>;
}

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

function indexChanges(status: GitStatus | null) {
  return Object.fromEntries((status?.changes ?? []).map((change) => [change.path, change.kind]));
}

function report(result: GitOpResult) {
  if (result.outcome === "conflict") toast.error(result.message, { duration: 12000 });
  else if (result.outcome === "nothing-to-commit" || result.outcome === "up-to-date" || result.outcome === "no-upstream") toast.info(result.message);
  else toast.success(result.message, result.backupBranch ? { duration: 10000 } : undefined);
}

export const useGitStore = create<GitState>((set, get) => {
  const setStatus = (status: GitStatus) => set({ status, changedByPath: indexChanges(status) });

  async function run(busy: NonNullable<Busy>, task: () => Promise<GitOpResult>) {
    if (get().busy) return;
    set({ busy });
    try {
      const result = await task();
      if (busy === "pull" || busy === "sync" || busy.startsWith("force")) set({ conflicted: result.outcome === "conflict" });
      report(result);
    } catch (error) {
      toast.error(errorText(error), { duration: 10000 });
    } finally {
      set({ busy: null });
      await get().refresh();
    }
  }

  return {
    status: null,
    settings: DEFAULT_GIT_SETTINGS,
    busy: null,
    commitMessage: "",
    changedByPath: {},
    conflicted: false,

    refresh: async () => {
      if (!useWorkspaceStore.getState().root) return set({ status: null, changedByPath: {} });
      try {
        setStatus(await api.git.status());
      } catch {
        set({ status: null, changedByPath: {} });
      }
    },

    loadSettings: async () => {
      if (!useWorkspaceStore.getState().root) return;
      try {
        set({ settings: await api.git.getSettings() });
      } catch {
        // 설정을 못 읽으면 기본값을 쓴다.
      }
    },

    saveSettings: async (patch) => {
      const next = { ...get().settings, ...patch };
      set({ settings: next });
      try {
        set({ settings: await api.git.setSettings(next) });
      } catch (error) {
        toast.error(`설정을 저장하지 못했어요: ${errorText(error)}`);
      }
    },

    setCommitMessage: (commitMessage) => set({ commitMessage }),

    init: async () => {
      set({ busy: "init" });
      try {
        setStatus(await api.git.init());
        toast.success("git 저장소를 만들었어요.");
      } catch (error) {
        toast.error(errorText(error));
      } finally {
        set({ busy: null });
      }
    },

    setRemote: async (url) => {
      set({ busy: "remote" });
      try {
        setStatus(await api.git.setRemote(url));
        toast.success("원격 저장소를 연결했어요.");
        return true;
      } catch (error) {
        toast.error(errorText(error));
        return false;
      } finally {
        set({ busy: null });
      }
    },

    commit: async () => {
      const message = get().commitMessage;
      await run("commit", () => api.git.commit(message));
      set({ commitMessage: "" });
    },
    pull: () => run("pull", () => api.git.pull()),
    push: () => run("push", () => api.git.push()),
    sync: () => run("sync", () => api.git.sync()),
    forcePull: () => run("force-pull", () => api.git.forcePull()),
    forcePush: () => run("force-push", () => api.git.forcePush()),
  };
});

function handleEvent(event: GitEvent) {
  if (event.kind === "status") useGitStore.setState({ status: event.status, changedByPath: indexChanges(event.status) });
  else if (event.kind === "info") toast.info(event.message);
  else toast.error(event.message, { duration: 10000 });
}

/** 글이 바뀔 때마다 git 상태를 다시 읽고, 메인 프로세스의 자동 커밋 결과를 받는다. 해제 함수를 돌려준다. */
export function startGitSync() {
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void useGitStore.getState().refresh(), REFRESH_DELAY_MS);
  };
  const stopEvents = api.git.onEvent(handleEvent);
  const stopWorkspace = useWorkspaceStore.subscribe((state, prev) => {
    if (state.root !== prev.root) void useGitStore.getState().loadSettings();
    if (state.notes !== prev.notes || state.root !== prev.root) schedule();
  });
  void useGitStore.getState().loadSettings();
  schedule();
  return () => {
    window.clearTimeout(timer);
    stopEvents();
    stopWorkspace();
  };
}
