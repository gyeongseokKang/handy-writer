// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { htmlToMarkdown } from "./html-to-markdown";

describe("htmlToMarkdown", () => {
  it("제목, 문단, 굵게, 목록, 링크를 마크다운으로 바꾼다", () => {
    const md = htmlToMarkdown('<h2>소제목</h2><p>본문 <strong>굵게</strong> <a href="/about">소개</a></p><ul><li>하나</li><li>둘</li></ul>', "https://blog.example.com/post/1");
    expect(md).toBe("## 소제목\n\n본문 **굵게** [소개](https://blog.example.com/about)\n\n- 하나\n- 둘");
  });

  it("그림은 원래 주소를 가리키는 임베드로, 그림 설명은 기울임으로 남긴다", () => {
    const md = htmlToMarkdown('<figure><img src="/img/a.png" alt="풍경"><figcaption>바다 사진</figcaption></figure>', "https://blog.example.com/post/1");
    expect(md).toBe("![풍경](https://blog.example.com/img/a.png)\n\n*바다 사진*");
  });

  it("스크립트, 입력 양식, 자바스크립트 링크는 버린다", () => {
    const md = htmlToMarkdown('<p>안전<script>alert(1)</script></p><form><input></form><p><a href="javascript:alert(1)">눌러</a></p><iframe src="https://x"></iframe>');
    expect(md).toBe("안전\n\n눌러");
  });
});
