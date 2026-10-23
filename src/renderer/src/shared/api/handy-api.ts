import type { HandyApi } from "@shared/types";

import { createMockApi } from "./mock-api";

function resolveApi(): HandyApi {
  if (window.api) return window.api;
  // 브라우저에서 UI만 띄워 볼 때(electron 밖)는 메모리 목업을 쓴다.
  if (import.meta.env.DEV) return createMockApi();
  throw new Error("Electron preload API를 찾을 수 없어요.");
}

export const api = resolveApi();
