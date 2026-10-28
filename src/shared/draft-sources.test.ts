import { describe, expect, it } from "vitest";

import { findYoutubeUrls, formatDuration, parseSources, pickCaptionTrack, youtubeSection, youtubeVideoId } from "./draft-sources";

describe("youtubeVideoId", () => {
  it("여러 모양의 유튜브 주소에서 영상 ID를 읽는다", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=zkmvCDSxqdc")).toBe("zkmvCDSxqdc");
    expect(youtubeVideoId("https://m.youtube.com/watch?v=zkmvCDSxqdc&t=30s")).toBe("zkmvCDSxqdc");
    expect(youtubeVideoId("https://youtu.be/zkmvCDSxqdc?si=abc")).toBe("zkmvCDSxqdc");
    expect(youtubeVideoId("https://www.youtube.com/shorts/zkmvCDSxqdc")).toBe("zkmvCDSxqdc");
    expect(youtubeVideoId("https://www.youtube.com/embed/zkmvCDSxqdc")).toBe("zkmvCDSxqdc");
    expect(youtubeVideoId("  https://www.youtube.com/live/zkmvCDSxqdc  ")).toBe("zkmvCDSxqdc");
  });

  it("유튜브 영상 주소가 아니면 null이다", () => {
    expect(youtubeVideoId("https://www.youtube.com/@channel")).toBeNull();
    expect(youtubeVideoId("https://example.com/watch?v=zkmvCDSxqdc")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/watch?v=짧음")).toBeNull();
    expect(youtubeVideoId("그냥 글")).toBeNull();
  });

  it("글 안의 유튜브 주소를 중복 없이 찾는다", () => {
    const text = "이 영상 https://youtu.be/zkmvCDSxqdc 보고, (https://www.youtube.com/watch?v=zkmvCDSxqdc) 또 https://www.youtube.com/watch?v=dQw4w9WgXcQ 와 https://example.com";
    expect(findYoutubeUrls(text)).toEqual(["https://youtu.be/zkmvCDSxqdc", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  });
});

describe("pickCaptionTrack", () => {
  const track = (languageCode: string, kind?: string) => ({ languageCode, kind, label: languageCode });

  it("직접 만든 한국어 자막을 가장 먼저 고른다", () => {
    expect(pickCaptionTrack([track("en"), track("ko", "asr"), track("ko")])).toEqual(track("ko"));
  });

  it("직접 만든 자막이 있으면 자동 생성 자막보다 먼저 고른다", () => {
    expect(pickCaptionTrack([track("ko", "asr"), track("ja")])).toEqual(track("ja"));
  });

  it("자동 생성 자막만 있으면 한국어, 영어, 나머지 순으로 고른다", () => {
    expect(pickCaptionTrack([track("de-DE", "asr"), track("en", "asr"), track("hi", "asr")])).toEqual(track("en", "asr"));
    expect(pickCaptionTrack([track("de-DE", "asr")])).toEqual(track("de-DE", "asr"));
    expect(pickCaptionTrack([])).toBeNull();
  });
});

describe("parseSources", () => {
  it("모양이 맞는 자료만 남기고, 유튜브 주소가 아닌 영상은 버린다", () => {
    const sources = parseSources([
      { kind: "youtube", url: "https://youtu.be/zkmvCDSxqdc", videoId: "zkmvCDSxqdc", title: "영상", transcript: 3 },
      { kind: "youtube", url: "https://evil.example.com", title: "가짜" },
      { kind: "project", path: "/p/app", name: "app", fileCount: 10 },
      { kind: "other" },
      null,
    ]);
    expect(sources.map((s) => s.kind)).toEqual(["youtube", "project"]);
    expect(sources[0]).toMatchObject({ title: "영상", transcript: "", seconds: 0 });
    expect(parseSources("x")).toEqual([]);
  });
});

describe("youtubeSection", () => {
  it("긴 자막은 잘라 넣고, 자막이 없으면 제목과 설명만 참고하라고 한다", () => {
    const base = { kind: "youtube" as const, videoId: "zkmvCDSxqdc", url: "u", title: '따옴표 "제목"', channel: "c", seconds: 61, description: "", captionLabel: "한국어" };
    const long = youtubeSection({ ...base, transcript: "가".repeat(50_000) });
    expect(long).toContain("…(이하 생략)");
    expect(long).toContain('title="따옴표  제목 "');
    expect(long).toContain('length="1:01"');
    expect(youtubeSection({ ...base, transcript: "" })).toContain("자막이 없는 영상이에요");
  });

  it("영상 길이를 시:분:초로 쓴다", () => {
    expect(formatDuration(2282)).toBe("38:02");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
