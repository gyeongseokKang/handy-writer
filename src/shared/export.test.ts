import { describe, expect, it } from "vitest";

import { buildHtmlDocument, exportFileName, inlineAssets } from "./export";

describe("buildHtmlDocument", () => {
  it("제목을 이스케이프해서 title과 제목 줄에 넣는다", () => {
    const html = buildHtmlDocument(`a <b> & "c"`, "<p>본문</p>");
    expect(html).toContain("<title>a &lt;b&gt; &amp; &quot;c&quot;</title>");
    expect(html).toContain('<h1 class="title">a &lt;b&gt; &amp; &quot;c&quot;</h1>');
    expect(html).toContain("<p>본문</p>");
    expect(html).toContain('<meta charset="utf-8">');
  });
});

describe("exportFileName", () => {
  it("파일 이름에 못 쓰는 글자를 빼고 확장자를 붙인다", () => {
    expect(exportFileName("a/b: c?", "pdf")).toBe("a b c.pdf");
    expect(exportFileName("   ", "md")).toBe("제목 없음.md");
    expect(exportFileName("끝점..", "html")).toBe("끝점.html");
  });
});

describe("inlineAssets", () => {
  it("작업 폴더 이미지를 data URL로 바꾸고 같은 파일은 한 번만 읽는다", async () => {
    const reads: string[] = [];
    const html = await inlineAssets(
      '<img src="handy-asset://vault/attachments/%EB%82%B4%20%EC%82%AC%EC%A7%84.png"><img src="handy-asset://vault/attachments/%EB%82%B4%20%EC%82%AC%EC%A7%84.png"><img src="https://x.com/a.png">',
      async (path) => {
        reads.push(path);
        return { mime: "image/png", base64: "AQID" };
      },
    );
    expect(reads).toEqual(["attachments/내 사진.png"]);
    expect(html.match(/src="data:image\/png;base64,AQID"/g)).toHaveLength(2);
    expect(html).toContain('src="https://x.com/a.png"');
  });

  it("읽지 못한 파일은 주소를 비운다", async () => {
    expect(await inlineAssets('<img src="handy-asset://vault/a.png">', async () => null)).toBe('<img src="">');
    expect(
      await inlineAssets('<img src="handy-asset://vault/a.png">', async () => {
        throw new Error("nope");
      }),
    ).toBe('<img src="">');
  });
});

describe("쪽 설정", () => {
  it("범위를 벗어나거나 이상한 값은 쓸 수 있는 값으로 고친다", async () => {
    const { DEFAULT_PAGE_OPTIONS, normalizePageOptions } = await import("./export");
    expect(normalizePageOptions(undefined)).toEqual(DEFAULT_PAGE_OPTIONS);
    expect(normalizePageOptions({ fontPt: 99, marginX: -3, marginY: "12", lineHeight: "abc", paper: "Tabloid", pageNumbers: "x", showTitle: "no" })).toEqual({
      ...DEFAULT_PAGE_OPTIONS,
      fontPt: 18,
      marginX: 5,
      marginY: 12,
    });
    expect(normalizePageOptions({ paper: "A5", pageNumbers: "of-total", showTitle: false })).toMatchObject({ paper: "A5", pageNumbers: "of-total", showTitle: false });
  });

  it("문서 CSS와 HTML에 고른 종이·여백·글자 크기가 들어가고, 제목은 끌 수 있다", async () => {
    const { buildHtmlDocument, documentCss, normalizePageOptions } = await import("./export");
    const options = normalizePageOptions({ paper: "A5", fontPt: 12, lineHeight: 1.8, marginX: 15, marginY: 25, showTitle: false });
    const css = documentCss(options);
    expect(css).toContain("@page { size: 148mm 210mm; margin: 25mm 15mm; }");
    expect(css).toContain("font-size: 12pt");
    expect(css).toContain("line-height: 1.8");
    const html = buildHtmlDocument("제목", "<p>본문</p>", options);
    expect(html).not.toContain('class="title"');
    expect(buildHtmlDocument("제목", "<p>본문</p>")).toContain('<h1 class="title">제목</h1>');
  });
});
