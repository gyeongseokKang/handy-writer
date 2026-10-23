import { describe, expect, it } from "vitest";

import {
  assetUrl,
  clampSize,
  decodeMarkdownTarget,
  formatBytes,
  formatMarkdownEmbed,
  formatWikiEmbed,
  kindOfPath,
  parseEmbedParams,
  resolveAttachment,
  sanitizeLabel,
  type AttachmentMeta,
} from "./attachments";

describe("kindOfPath", () => {
  it("확장자로 종류를 정하고 대소문자와 쿼리를 무시한다", () => {
    expect(kindOfPath("a/b.PNG")).toBe("image");
    expect(kindOfPath("영상.webm")).toBe("video");
    expect(kindOfPath("https://x.com/a.jpg?w=100")).toBe("image");
    expect(kindOfPath("녹음.m4a")).toBe("audio");
    expect(kindOfPath("논문.pdf")).toBe("pdf");
    expect(kindOfPath("사진 #1.png")).toBe("image");
    expect(kindOfPath("what?.png")).toBe("image");
    expect(kindOfPath("다른 글")).toBe("other");
    expect(kindOfPath("script.js")).toBe("other");
  });
});

describe("parseEmbedParams / format", () => {
  it("마지막 숫자 조각은 크기, 나머지는 라벨이다", () => {
    expect(parseEmbedParams([])).toEqual({ label: "", width: null, height: null });
    expect(parseEmbedParams(["300"])).toEqual({ label: "", width: 300, height: null });
    expect(parseEmbedParams(["300x200"])).toEqual({ label: "", width: 300, height: 200 });
    expect(parseEmbedParams(["여행 사진"])).toEqual({ label: "여행 사진", width: null, height: null });
    expect(parseEmbedParams(["여행 사진", "300"])).toEqual({ label: "여행 사진", width: 300, height: null });
    expect(parseEmbedParams(["a", "b", "120x80"])).toEqual({ label: "a|b", width: 120, height: 80 });
  });

  it("위키 임베드로 쓰고 다시 읽으면 같은 값이다", () => {
    const cases = [
      { label: "", width: null, height: null },
      { label: "라벨", width: null, height: null },
      { label: "", width: 300, height: null },
      { label: "한글 라벨", width: 300, height: 200 },
    ];
    for (const params of cases) {
      const text = formatWikiEmbed({ target: "그림 1.png", ...params });
      const inner = text.slice(3, -2).split("|");
      expect(inner[0]).toBe("그림 1.png");
      expect(parseEmbedParams(inner.slice(1))).toEqual(params);
    }
    expect(formatWikiEmbed({ target: "a.png", label: "L", width: 300, height: null })).toBe("![[a.png|L|300]]");
  });

  it("일반 마크다운 이미지로 쓸 때 공백과 괄호는 인코딩하고 원격 주소는 그대로 둔다", () => {
    const base = { label: "사진", width: 200, height: null, title: "" };
    expect(formatMarkdownEmbed({ ...base, target: "attachments/내 사진 (1).png" })).toBe("![사진|200](attachments/내%20사진%20%281%29.png)");
    expect(formatMarkdownEmbed({ ...base, target: "https://a.com/x(1).png", title: "제목" })).toBe('![사진|200](https://a.com/x(1).png "제목")');
  });

  it("마크다운 대상의 퍼센트 인코딩과 꺾쇠를 풀고, 깨진 인코딩은 그대로 둔다", () => {
    expect(decodeMarkdownTarget("attachments/내%20사진.png")).toBe("attachments/내 사진.png");
    expect(decodeMarkdownTarget("<attachments/내 사진.png>")).toBe("attachments/내 사진.png");
    expect(decodeMarkdownTarget("a/%E0%A4%A.png")).toBe("a/%E0%A4%A.png");
  });
});

describe("sanitizeLabel / clampSize", () => {
  it("라벨의 구분 문자를 정리하고, 숫자만 있는 라벨은 거부한다", () => {
    expect(sanitizeLabel("  여행 | 사진 ]  ")).toBe("여행 사진");
    expect(sanitizeLabel("")).toBe("");
    expect(sanitizeLabel("2024")).toBeNull();
    expect(sanitizeLabel("300x200")).toBeNull();
    expect(sanitizeLabel("2024년")).toBe("2024년");
  });

  it("크기를 정수로 맞추고 범위를 벗어나면 정리한다", () => {
    expect(clampSize(299.6)).toBe(300);
    expect(clampSize(0)).toBeNull();
    expect(clampSize(-5)).toBeNull();
    expect(clampSize(Number.NaN)).toBeNull();
    expect(clampSize(null)).toBeNull();
    expect(clampSize(99999)).toBe(8000);
  });
});

describe("resolveAttachment", () => {
  const file = (path: string): AttachmentMeta => ({ path, name: path.split("/").pop() ?? path, kind: "image", size: 1, mtime: 0 });
  const list = [file("attachments/a.png"), file("일기/a.png"), file("attachments/Photo 1.JPG")];

  it("이름만 쓰면 글과 같은 폴더를 먼저, 그다음 attachments 폴더를, 그다음 경로가 짧은 파일을 고른다", () => {
    expect(resolveAttachment(list, "a.png", "일기")?.path).toBe("일기/a.png");
    expect(resolveAttachment(list, "a.png", "")?.path).toBe("attachments/a.png");
    expect(resolveAttachment(list, "photo 1.jpg")?.path).toBe("attachments/Photo 1.JPG");
    expect(resolveAttachment([file("z/very/long/path/c.png"), file("y/c.png")], "c.png")?.path).toBe("y/c.png");
  });

  it("경로로 쓰면 작업 폴더 기준, 없으면 글이 있는 폴더 기준으로 찾는다", () => {
    expect(resolveAttachment(list, "attachments/a.png")?.path).toBe("attachments/a.png");
    expect(resolveAttachment(list, "./attachments/a.png")?.path).toBe("attachments/a.png");
    expect(resolveAttachment([file("일기/img/b.png")], "img/b.png", "일기")?.path).toBe("일기/img/b.png");
  });

  it("없는 파일이나 빈 대상은 null이다", () => {
    expect(resolveAttachment(list, "없음.png")).toBeNull();
    expect(resolveAttachment(list, "  ")).toBeNull();
  });
});

describe("assetUrl / formatBytes", () => {
  it("경로의 각 조각을 인코딩해서 프로토콜 주소로 만든다", () => {
    expect(assetUrl("attachments/내 사진 #1.png")).toBe("handy-asset://vault/attachments/%EB%82%B4%20%EC%82%AC%EC%A7%84%20%231.png");
  });

  it("바이트를 읽기 쉬운 단위로 바꾼다", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(20 * 1024)).toBe("20KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120MB");
  });
});
