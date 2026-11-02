import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ net: { fetch: vi.fn() } }));

import { CloudflareVersionJsonProvider, createDeployProvider, VercelVersionJsonProvider } from "./deploy";

const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("deploy providers", () => {
  it("kind 별로 공급자를 고른다", () => {
    expect(createDeployProvider({ kind: "cloudflare-version-json", siteUrl: "https://review.handykang.com/" })).toBeInstanceOf(CloudflareVersionJsonProvider);
    expect(createDeployProvider({ kind: "vercel-version-json", siteUrl: "https://x.vercel.app" })).toBeInstanceOf(VercelVersionJsonProvider);
    expect(createDeployProvider(null)).toBeNull();
  });
  it("Cloudflare 공급자는 version.json 의 sha 를 읽는다", async () => {
    const p = new CloudflareVersionJsonProvider("https://review.handykang.com/", ok({ sha: "d8a891e1234", builtAt: "x" }));
    expect(p.info.siteUrl).toBe("https://review.handykang.com");
    await expect(p.deployedSha()).resolves.toBe("d8a891e1234");
  });
  it("sha 가 없으면 에러", async () => {
    await expect(new CloudflareVersionJsonProvider("https://a", ok({})).deployedSha()).rejects.toThrow();
  });
});
