import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { buildDocx, imageTypeOf } from "./docx";

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

describe("imageTypeOf", () => {
  it("파일 앞부분으로 형식을 안다", () => {
    expect(imageTypeOf(PNG)).toBe("png");
    expect(imageTypeOf(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe("jpg");
    expect(imageTypeOf(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});

describe("buildDocx", () => {
  it("제목, 문단, 각주, 표, 그림을 담은 .docx를 만든다", async () => {
    const buffer = await buildDocx(
      {
        title: "내 원고",
        blocks: [
          { type: "heading", level: 1, children: [{ type: "text", text: "1장" }] },
          { type: "paragraph", children: [{ type: "text", text: "본문", bold: true }, { type: "footnote", id: 1 }, { type: "text", text: "링크", link: "https://a.b" }] },
          { type: "list-item", ordered: 1, level: 0, checked: null, children: [{ type: "text", text: "번호" }] },
          { type: "list-item", ordered: null, level: 1, checked: true, children: [{ type: "text", text: "할 일" }] },
          { type: "table", rows: [{ header: true, cells: [[{ type: "text", text: "칸" }]] }] },
          { type: "paragraph", children: [{ type: "image", src: "a.png", width: 10, height: 10, alt: "점" }, { type: "image", src: "없음.png", width: 10, height: 10, alt: "없는 그림" }] },
          { type: "code", text: "a\nb" },
          { type: "rule" },
        ],
        footnotes: { 1: [{ type: "text", text: "각주 내용" }] },
      },
      async (src) => (src === "a.png" ? { data: PNG, type: "png" } : null),
    );
    const files = unzipSync(new Uint8Array(buffer));
    const xml = strFromU8(files["word/document.xml"]!);
    expect(xml).toContain("내 원고");
    expect(xml).toContain("1장");
    expect(xml).toContain("[그림: 없는 그림]");
    expect(xml).toContain("☑ ");
    expect(strFromU8(files["word/footnotes.xml"]!)).toContain("각주 내용");
    expect(Object.keys(files).some((name) => name.startsWith("word/media/"))).toBe(true);
  });
});
