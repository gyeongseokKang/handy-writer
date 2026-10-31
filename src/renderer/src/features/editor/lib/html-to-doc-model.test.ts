// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { htmlToDocModel, MAX_IMAGE_WIDTH } from "./html-to-doc-model";

const noSize = async () => null;

describe("htmlToDocModel", () => {
  it("제목, 서식, 링크, 문단을 옮긴다", async () => {
    const model = await htmlToDocModel("글", `<h2>소제목</h2><p>보통 <strong>굵게 <em>기울임</em></strong> <a href="https://a.b">링크</a> <a href="javascript:x">위험</a> <code>c</code></p>`, noSize);
    expect(model.title).toBe("글");
    expect(model.blocks[0]).toEqual({ type: "heading", level: 2, children: [{ type: "text", text: "소제목" }] });
    expect(model.blocks[1]).toEqual({
      type: "paragraph",
      children: [
        { type: "text", text: "보통 " },
        { type: "text", text: "굵게 ", bold: true },
        { type: "text", text: "기울임", bold: true, italic: true },
        { type: "text", text: " " },
        { type: "text", text: "링크", link: "https://a.b" },
        { type: "text", text: " " },
        { type: "text", text: "위험" },
        { type: "text", text: " " },
        { type: "text", text: "c", code: true },
      ],
    });
  });

  it("목록은 깊이와 번호 목록을 기억하고, 할 일은 체크 여부를 남긴다", async () => {
    const html = `<ol><li><p>하나</p><ul><li><p>안</p></li></ul></li><li><p>둘</p></li></ol><ol><li><p>새 목록</p></li></ol>
      <ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>끝냄</p></div></li></ul>`;
    const model = await htmlToDocModel("글", html, noSize);
    expect(model.blocks.map((b) => (b.type === "list-item" ? [b.ordered, b.level, b.checked] : b.type))).toEqual([
      [1, 0, null],
      [null, 1, null],
      [1, 0, null],
      [2, 0, null],
      [null, 0, true],
    ]);
  });

  it("각주 표시와 내용 줄을 Word 각주로 잇는다", async () => {
    const html = `<p>본문<sup class="footnote-ref" data-footnote="a">1</sup></p><div class="footnote-def" data-footnote="a"><span class="footnote-label">1</span><span class="footnote-body">설명</span></div>`;
    const model = await htmlToDocModel("글", html, noSize);
    expect(model.blocks).toEqual([{ type: "paragraph", children: [{ type: "text", text: "본문" }, { type: "footnote", id: 1 }] }]);
    expect(model.footnotes).toEqual({ 1: [{ type: "text", text: "설명" }] });
  });

  it("인용·콜아웃은 깊이를, 캡션은 역할을, 표는 머리글 행을 남긴다", async () => {
    const html = `<blockquote><p>인용</p></blockquote><div class="callout"><div class="callout-title">참고</div><div class="callout-body"><p>안</p></div></div>
      <p class="caption"><strong class="caption-label">그림 1. </strong>설명</p><table><tbody><tr><th><p>가</p></th></tr><tr><td><p>1</p><p>2</p></td></tr></tbody></table><pre><code>a\nb\n</code></pre><hr>`;
    const model = await htmlToDocModel("글", html, noSize);
    expect(model.blocks[0]).toMatchObject({ type: "paragraph", quote: 1 });
    expect(model.blocks[1]).toMatchObject({ type: "paragraph", quote: 1, role: "callout-title" });
    expect(model.blocks[2]).toMatchObject({ type: "paragraph", quote: 1 });
    expect(model.blocks[3]).toMatchObject({ type: "paragraph", role: "caption" });
    expect(model.blocks[4]).toEqual({
      type: "table",
      rows: [
        { header: true, cells: [[{ type: "text", text: "가" }]] },
        { header: false, cells: [[{ type: "text", text: "1" }, { type: "break" }, { type: "text", text: "2" }]] },
      ],
    });
    expect(model.blocks[5]).toEqual({ type: "code", text: "a\nb" });
    expect(model.blocks[6]).toEqual({ type: "rule" });
  });

  it("그림 크기를 읽고 본문 폭에 맞춰 줄인다", async () => {
    const model = await htmlToDocModel("글", `<p><img src="a.png" alt="가"></p><p><img src="b.png" width="300"></p>`, async (src) =>
      src === "a.png" ? { width: 1200, height: 600 } : { width: 100, height: 50 },
    );
    expect(model.blocks[0]).toEqual({ type: "paragraph", children: [{ type: "image", src: "a.png", alt: "가", width: MAX_IMAGE_WIDTH, height: 300 }] });
    expect(model.blocks[1]).toMatchObject({ children: [{ width: 300, height: 150 }] });
  });
});
