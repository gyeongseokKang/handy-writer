import { describe, expect, it } from "vitest";

import { cleanTitle, extractFrontmatter, normalizeExtractUrl, textToParagraphs } from "./extract";

describe("normalizeExtractUrl", () => {
  it("http(s) 주소만 받고, 스킴이 없으면 https를 붙인다", () => {
    expect(normalizeExtractUrl("  <https://example.com/a?b=1>  ")).toBe("https://example.com/a?b=1");
    expect(normalizeExtractUrl("brunch.co.kr/@a/1")).toBe("https://brunch.co.kr/@a/1");
    expect(normalizeExtractUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(normalizeExtractUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeExtractUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExtractUrl("그냥 글")).toBeNull();
    expect(normalizeExtractUrl("")).toBeNull();
  });
});

describe("textToParagraphs", () => {
  it("빈 줄로 문단을 나누고 HTML을 이스케이프한다", () => {
    expect(textToParagraphs("첫 줄\n이어짐\n\n<b>둘째</b>\n\n\n")).toBe("<p>첫 줄 이어짐</p><p>&lt;b&gt;둘째&lt;/b&gt;</p>");
  });
});

describe("extractFrontmatter", () => {
  it("주소, 글쓴이, 가져온 날짜를 YAML로 남긴다", () => {
    expect(extractFrontmatter({ url: "https://a.com/x", byline: "홍길동" }, new Date(2026, 9, 30))).toBe(
      '---\nsource: "https://a.com/x"\nauthor: "홍길동"\nextracted: 2026-10-30\n---\n',
    );
    expect(extractFrontmatter({ url: "https://a.com", byline: "" }, new Date(2026, 0, 2))).toBe('---\nsource: "https://a.com"\nextracted: 2026-01-02\n---\n');
  });
});

describe("cleanTitle", () => {
  it("뒤에 붙은 사이트 이름을 뗀다", () => {
    expect(cleanTitle("달리기를 시작하는 법 | 러닝 블로그")).toBe("달리기를 시작하는 법");
    expect(cleanTitle("Release notes - GitHub", "GitHub")).toBe("Release notes");
  });
  it("떼고 남는 제목이 짧거나 구분자가 없으면 그대로 둔다", () => {
    expect(cleanTitle("A | 아주 긴 부제가 붙은 글의 제목이에요")).toBe("A | 아주 긴 부제가 붙은 글의 제목이에요");
    expect(cleanTitle("그냥 제목")).toBe("그냥 제목");
  });
});
