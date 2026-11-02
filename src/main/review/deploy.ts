import { net } from "electron";

import type { DeployProviderInfo } from "../../shared/review";

/**
 * 배포된 커밋을 알려 주는 공급자. 나중에 Vercel API·GitHub Deployments 등으로 늘릴 수 있게 인터페이스로 둔다.
 * 지금은 배포를 '확인'만 한다. 배포를 직접 일으키는 기능(푸시 트리거·workflow_dispatch·Vercel API)은 일부러 넣지 않았다.
 */
export interface DeployProvider {
  readonly info: DeployProviderInfo;
  deployedSha(): Promise<string>;
}

export class VercelVersionJsonProvider implements DeployProvider {
  readonly info: DeployProviderInfo;
  constructor(siteUrl: string, private readonly fetchImpl: typeof fetch = (input, init) => net.fetch(input as string, init)) {
    this.info = { kind: "vercel-version-json", siteUrl: siteUrl.replace(/\/+$/, "") };
  }
  async deployedSha() {
    const res = await this.fetchImpl(`${this.info.siteUrl}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`version.json 응답 ${res.status}`);
    const body = (await res.json()) as { sha?: unknown };
    if (typeof body.sha !== "string" || !/^[0-9a-f]{7,40}$/.test(body.sha)) throw new Error("version.json에 커밋 SHA가 없어요.");
    return body.sha;
  }
}

export function createDeployProvider(info: DeployProviderInfo | null): DeployProvider | null {
  if (!info?.siteUrl) return null;
  return new VercelVersionJsonProvider(info.siteUrl);
}
