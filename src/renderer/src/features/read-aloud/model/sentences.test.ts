import { describe, expect, it } from "vitest";

import { splitSentences } from "./sentences";

const parts = (text: string) => splitSentences(text).map(([s, e]) => text.slice(s, e));

describe("splitSentences", () => {
  it("마침표·물음표·느낌표·말줄임표에서 나눈다", () => {
    expect(parts("처음입니다. 정말요? 좋아요! 그런데…  끝")).toEqual(["처음입니다.", "정말요?", "좋아요!", "그런데…", "끝"]);
  });

  it("닫는 따옴표와 괄호는 앞 문장에 붙이고, 숫자 속 마침표에서는 나누지 않는다", () => {
    expect(parts("그는 \"됐다.\" 라고 했다. 버전 1.2를 썼다 (정말이다.) 다음")).toEqual(["그는 \"됐다.\"", "라고 했다.", "버전 1.2를 썼다 (정말이다.)", "다음"]);
  });

  it("글자가 없는 조각은 버린다", () => {
    expect(parts(" — ... ")).toEqual([]);
    expect(parts("")).toEqual([]);
  });
});

describe("sentenceLang", () => {
  it("한글이 없고 로마자가 있으면 영어", async () => {
    const { sentenceLang } = await import("./use-read-aloud");
    expect(sentenceLang("be able to take all of the knowledge")).toBe("en");
    expect(sentenceLang("PR이 쏟아지는 속도")).toBe("ko");
    expect(sentenceLang("2024.")).toBe("ko");
  });
});
