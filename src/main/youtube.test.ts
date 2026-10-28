import { describe, expect, it, vi } from "vitest";

import { fetchYoutube, json3ToText } from "./youtube";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeFetch(player: unknown, captions: unknown = { events: [{ segs: [{ utf8: "안녕하세요\n" }, { utf8: "여러분" }] }, { segs: [{ utf8: "[음악]" }] }, {}, { segs: [{ utf8: " 오늘은" }] }] }) {
  return vi.fn(async (url: string | URL | Request) => (String(url).includes("/player") ? json(player) : json(captions))) as unknown as typeof fetch;
}

const player = (tracks: unknown[]) => ({
  playabilityStatus: { status: "OK" },
  videoDetails: { videoId: "zkmvCDSxqdc", title: "영상 제목", author: "채널", lengthSeconds: "125", shortDescription: "설명" },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
});

describe("fetchYoutube", () => {
  it("영상 정보와 고른 자막을 json3로 받아 한 덩어리 글로 돌려준다", async () => {
    const fetcher = fakeFetch(
      player([
        { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=srv3", languageCode: "en", kind: "asr", name: { runs: [{ text: "영어 (자동 생성됨)" }] } },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=ko", languageCode: "ko", name: { simpleText: "한국어" } },
      ]),
    );
    const video = await fetchYoutube("https://youtu.be/zkmvCDSxqdc?si=1", fetcher);
    expect(video).toMatchObject({
      videoId: "zkmvCDSxqdc",
      url: "https://www.youtube.com/watch?v=zkmvCDSxqdc",
      title: "영상 제목",
      channel: "채널",
      seconds: 125,
      description: "설명",
      transcript: "안녕하세요 여러분 오늘은",
      captionLabel: "한국어",
    });
    const captionUrl = String(vi.mocked(fetcher).mock.calls[1]?.[0]);
    expect(captionUrl).toContain("lang=ko");
    expect(captionUrl).toContain("fmt=json3");
  });

  it("자막이 없거나 못 받으면 자막 없이 돌려준다", async () => {
    expect((await fetchYoutube("https://youtu.be/zkmvCDSxqdc", fakeFetch(player([])))).transcript).toBe("");
    const broken = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/player") ? json(player([{ baseUrl: "https://x/timedtext", languageCode: "ko" }])) : json({}, 500),
    ) as unknown as typeof fetch;
    expect(await fetchYoutube("https://youtu.be/zkmvCDSxqdc", broken)).toMatchObject({ transcript: "", captionLabel: "" });
  });

  it("볼 수 없는 영상, 유튜브가 아닌 주소, 연결 실패는 알아듣게 실패한다", async () => {
    await expect(fetchYoutube("https://youtu.be/zkmvCDSxqdc", fakeFetch({ playabilityStatus: { status: "ERROR", reason: "삭제된 동영상" } }))).rejects.toThrow("이 영상은 불러올 수 없어요: 삭제된 동영상");
    await expect(fetchYoutube("https://example.com")).rejects.toThrow("유튜브 영상 주소가 아니에요.");
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchYoutube("https://youtu.be/zkmvCDSxqdc", offline)).rejects.toThrow("인터넷 연결을 확인해 주세요");
  });
});

describe("json3ToText", () => {
  it("비어 있는 자막은 빈 글이다", () => {
    expect(json3ToText({})).toBe("");
  });
});
