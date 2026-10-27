import { ipcMain } from "electron";

import type { AiEvent, AiRequest, AiTask } from "../../shared/ai";
import { buildUserPrompt } from "../../shared/ai-prompt";
import { parseBrief, parseOutline } from "../../shared/draft";
import { IPC } from "../../shared/types";
import { logEntry } from "../app-log";
import { claudeStatus, findClaude, runClaude } from "./claude-cli";
import { readRules, writeRules } from "./rules";

const TASKS: AiTask[] = ["polish", "proofread", "continue", "custom", "template", "outline", "draft"];

/** 렌더러에서 온 값을 믿지 않고 모양을 확인한다. */
function parseRequest(value: unknown): AiRequest {
  const v = value as Partial<AiRequest> | null;
  const str = (x: unknown) => (typeof x === "string" ? x : "");
  if (!v || !TASKS.includes(v.task as AiTask)) throw new Error("알 수 없는 AI 작업이에요.");
  if (!str(v.runId)) throw new Error("runId가 없어요.");
  return {
    runId: str(v.runId),
    task: v.task as AiTask,
    rules: str(v.rules),
    noteName: str(v.noteName),
    text: str(v.text),
    before: str(v.before),
    instruction: str(v.instruction),
    templatePrompt: str(v.templatePrompt),
    // 웹 검색은 템플릿 작업에서만, 참고 글 기반 모드가 아닐 때만 켠다.
    web: v.task === "template" && v.web === true && v.groundedOnly !== true,
    groundedOnly: v.task === "template" && v.groundedOnly === true,
    references: Array.isArray(v.references)
      ? v.references.map((ref) => ({ name: str(ref?.name), content: str(ref?.content) }))
      : [],
    ...(v.task === "outline" || v.task === "draft" ? { brief: parseBrief(v.brief) } : {}),
    ...(v.task === "draft" ? { outline: parseOutline(v.outline) } : {}),
  };
}

export function registerAiIpc(requireRoot: () => string) {
  const runs = new Map<string, AbortController>();

  ipcMain.handle(IPC.rulesGet, () => readRules(requireRoot()));
  ipcMain.handle(IPC.rulesSet, (_e, content: string) => writeRules(requireRoot(), String(content)));

  ipcMain.handle(IPC.aiStatus, () => claudeStatus());

  ipcMain.handle(IPC.aiRun, async (event, raw: unknown) => {
    const request = parseRequest(raw);
    const root = requireRoot();
    const exe = await findClaude();
    if (!exe) throw new Error((await claudeStatus()).reason ?? "claude를 찾지 못했어요.");

    const runId = request.runId;
    const controller = new AbortController();
    runs.set(runId, controller);
    const send = (aiEvent: AiEvent) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC.aiEvent, aiEvent);
    };

    runClaude({
      exe,
      cwd: root,
      prompt: buildUserPrompt(request),
      signal: controller.signal,
      web: request.web,
      // 긴 초안은 글을 쓰는 데만 몇 분이 걸린다.
      long: request.task === "draft",
      onDelta: (text) => send({ runId, type: "delta", text }),
      onStatus: (text) => send({ runId, type: "status", text }),
      onReset: () => send({ runId, type: "reset" }),
    })
      .then((text) => send({ runId, type: "done", text }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        // 사용자가 멈춘 것은 오류가 아니다.
        if (!controller.signal.aborted) logEntry({ level: "error", source: "AI", message });
        send({ runId, type: "error", message });
      })
      .finally(() => runs.delete(runId));

    return runId;
  });

  ipcMain.handle(IPC.aiCancel, (_e, runId: string) => {
    runs.get(runId)?.abort();
  });
}
