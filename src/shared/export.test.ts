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
