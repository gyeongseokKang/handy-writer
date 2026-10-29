// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { toExportHtml, withPasteStyles } from "./export-html";

const attachments = [{ path: "attachments/사진.png", name: "사진.png", kind: "image" as const, size: 1, mtime: 0 }, { path: "attachments/영상.mp4", name: "영상.mp4", kind: "video" as const, size: 1, mtime: 0 }];
const ctx = { attachments, noteFolder: "" };

describe("toExportHtml", () => {
  it("작업 폴더 이미지 임베드를 img로 바꾸고 크기를 옮긴다", () => {
    const html = toExportHtml('<p><span data-embed="사진.png" data-label="내 사진" data-width="300" data-height="">내 사진</span></p>', ctx);
    expect(html).toContain('<img src="handy-asset://vault/attachments/%EC%82%AC%EC%A7%84.png" alt="내 사진" width="300">');
  });

  it("원격 이미지·영상은 주소 그대로, 작업 폴더 영상은 이름만 남긴다", () => {
    expect(toExportHtml('<span data-embed="https://a.com/x.png"></span>', ctx)).toContain('src="https://a.com/x.png"');
    expect(toExportHtml('<span data-embed="https://a.com/x.mp4"></span>', ctx)).toContain("<video");
    expect(toExportHtml('<span data-embed="영상.mp4"></span>', ctx)).toContain("[영상: 영상.mp4]");
  });

  it("다른 글 임베드는 위키링크 모양의 이름으로, 없는 이미지도 이름으로 남긴다", () => {
    expect(toExportHtml('<span data-embed="다른 글">다른 글</span>', ctx)).toContain("[[다른 글]]");
    expect(toExportHtml('<span data-embed="없음.png"></span>', ctx)).toContain("[이미지: 없음.png]");
  });

  it("편집용 속성을 걷어내고 체크박스를 잠근다", () => {
    const html = toExportHtml('<div class="callout-title" contenteditable="false">팁</div><label><input type="checkbox" checked></label>', ctx);
    expect(html).not.toContain("contenteditable");
    expect(html).toContain("disabled");
  });
});

describe("withPasteStyles", () => {
  it("표와 코드에 style 속성을 넣고 코드블록 안의 code에는 넣지 않는다", () => {
    const html = withPasteStyles("<table><tr><td>a</td></tr></table><pre><code>x</code></pre><p><code>y</code></p>");
    expect(html).toContain('<td style="border:1px solid');
    expect(html).toContain('<pre style="background');
    expect(html).toContain("<pre style=\"background:#f6f8fa;border-radius:6px;padding:12px;white-space:pre-wrap;\"><code>x</code>");
    expect(html).toContain('<p><code style="background');
  });
});
