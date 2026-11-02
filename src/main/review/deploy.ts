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

const defaultFetch: typeof fetch = (input, init) => net.fetch(input as string, init);

/** 정적 사이트의 /version.json 을 읽는 공통 구현. 호스트(Vercel/Cloudflare)는 빌드 env 만 다르다. */
abstract class VersionJsonProvider implements DeployProvider {
  readonly info: DeployProviderInfo;
  constructor(kind: DeployProviderInfo["kind"], siteUrl: string, private readonly fetchImpl: typeof fetch = defaultFetch) {
    this.info = { kind, siteUrl: siteUrl.replace(/\/+$/, "") };
  }
  async deployedSha() {
    const res = await this.fetchImpl(`${this.info.siteUrl}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`version.json 응답 ${res.status}`);
    const body = (await res.json()) as { sha?: unknown };
    if (typeof body.sha !== "string" || !/^[0-9a-f]{7,40}$/.test(body.sha)) throw new Error("version.json에 커밋 SHA가 없어요.");
    return body.sha;
  }
}

export class VercelVersionJsonProvider extends VersionJsonProvider {
  constructor(siteUrl: string, fetchImpl?: typeof fetch) { super("vercel-version-json", siteUrl, fetchImpl); }
}

/**
 * Cloudflare Workers/Pages 정적 배포. 빌드 때 WORKERS_CI_COMMIT_SHA / CF_PAGES_COMMIT_SHA 가 version.json 에 들어간다.
 * 토큰이 필요한 Cloudflare API(배포 목록·빌드 상태 조회·재배포)는 일부러 쓰지 않는다. 나중에 붙일 자리만 남겨 둠.
 */
export class CloudflareVersionJsonProvider extends VersionJsonProvider {
  constructor(siteUrl: string, fetchImpl?: typeof fetch) { super("cloudflare-version-json", siteUrl, fetchImpl); }
}

export function createDeployProvider(info: DeployProviderInfo | null): DeployProvider | null {
  if (!info?.siteUrl) return null;
  switch (info.kind) {
    case "cloudflare-version-json": return new CloudflareVersionJsonProvider(info.siteUrl);
    case "vercel-version-json": return new VercelVersionJsonProvider(info.siteUrl);
    default: return new CloudflareVersionJsonProvider(info.siteUrl);
  }
}
