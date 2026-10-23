import { describe, expect, it, vi } from "vitest";

import type { OnlineTypo } from "../../shared/online-spell";
import { createOnlineSpeller, type SpellTransport } from "./online-speller";

const typo: OnlineTypo = { token: "모래속에", suggestions: ["모래 속에"], type: "space" };

function setup(overrides: Partial<SpellTransport> = {}, extra: { online?: boolean } = {}) {
  let time = 1_000_000;
  const transport: SpellTransport = {
    daum: vi.fn(async () => [typo]),
    naver: vi.fn(async () => [{ ...typo, type: undefined }]),
    ...overrides,
  };
  const speller = createOnlineSpeller({ transport, isOnline: () => extra.online ?? true, now: () => time, cooldownMs: 60_000, maxChars: 50 });
  return { speller, transport, advance: (ms: number) => (time += ms) };
}

describe("createOnlineSpeller", () => {
  it("온라인이면 다음 결과를 돌려준다", async () => {
    const { speller, transport } = setup();
    expect(await speller.check("모래속에 두 손을 넣고")).toEqual({ status: "ok", typos: [typo] });
    expect(transport.naver).not.toHaveBeenCalled();
  });

  it("오프라인이면 서버를 부르지 않고 건너뛴다", async () => {
    const { speller, transport } = setup({}, { online: false });
    expect(await speller.check("모래속에")).toEqual({ status: "offline", typos: [] });
    expect(transport.daum).not.toHaveBeenCalled();
  });

  it("한글이 없는 글은 보내지 않는다 (개인정보를 불필요하게 내보내지 않는다)", async () => {
    const { speller, transport } = setup();
    expect(await speller.check("hello 123 !!")).toEqual({ status: "ok", typos: [] });
    expect(await speller.check("")).toEqual({ status: "ok", typos: [] });
    expect(transport.daum).not.toHaveBeenCalled();
  });

  it("다음이 실패하면 네이버로 한 번 더 시도한다", async () => {
    const { speller, transport } = setup({ daum: vi.fn(async () => Promise.reject(new Error("fetch failed"))) });
    const result = await speller.check("모래속에");
    expect(result.status).toBe("ok");
    expect(result.typos).toHaveLength(1);
    expect(transport.naver).toHaveBeenCalledOnce();
  });

  it("둘 다 실패하면 오프라인으로 보고, 쉬는 동안은 서버를 다시 부르지 않다가 시간이 지나면 다시 시도한다", async () => {
    const fail = vi.fn(async () => Promise.reject(new Error("fetch failed")));
    const { speller, transport, advance } = setup({ daum: fail, naver: fail });

    expect(await speller.check("모래속에")).toEqual({ status: "offline", typos: [] });
    expect(speller.cooling).toBe(true);
    expect(fail).toHaveBeenCalledTimes(2);

    await speller.check("다른 글입니다");
    expect(fail).toHaveBeenCalledTimes(2); // 쉬는 중이라 부르지 않는다

    advance(61_000);
    expect(speller.cooling).toBe(false);
    transport.daum = vi.fn(async () => [typo]);
    expect(await speller.check("모래속에")).toMatchObject({ status: "ok" });
  });

  it("너무 긴 글은 앞부분만 보낸다", async () => {
    const { speller, transport } = setup();
    await speller.check("가".repeat(200));
    expect(vi.mocked(transport.daum).mock.calls[0]![0]).toHaveLength(50);
  });
});
