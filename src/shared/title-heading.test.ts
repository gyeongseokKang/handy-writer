import { describe, expect, it } from "vitest";

import { isTitleHeading, syncTitleHeading } from "./title-heading";

describe("isTitleHeading", () => {
  it("공백과 대소문자 차이는 같은 제목으로 본다", () => {
    expect(isTitleHeading("My  Note ", "my note")).toBe(true);
    expect(isTitleHeading("다른 제목", "글")).toBe(false);
    expect(isTitleHeading("", "")).toBe(false);
  });
});

describe("syncTitleHeading", () => {
  it("첫 줄이 옛 제목이면 새 제목으로 바꾸고 나머지는 그대로 둔다", () => {
    expect(syncTitleHeading("# 옛 제목\n\n본문\n\n## 소제목\n", "옛 제목", "새 제목")).toBe("# 새 제목\n\n본문\n\n## 소제목\n");
  });

  it("frontmatter와 그 뒤 빈 줄을 지킨다", () => {
    const raw = "---\ntags: [a]\n---\n\n# 옛 제목\n\n본문\n";
    expect(syncTitleHeading(raw, "옛 제목", "새 제목")).toBe("---\ntags: [a]\n---\n\n# 새 제목\n\n본문\n");
  });

  it("닫는 #과 CRLF도 다룬다", () => {
    expect(syncTitleHeading("# 옛 제목 #\r\n\r\n본문\r\n", "옛 제목", "새 제목")).toBe("# 새 제목\r\n\r\n본문\r\n");
  });

  it("첫 줄이 제목이 아니거나 다른 제목이면 건드리지 않는다", () => {
    expect(syncTitleHeading("본문\n# 옛 제목\n", "옛 제목", "새 제목")).toBeNull();
    expect(syncTitleHeading("# 다른 제목\n", "옛 제목", "새 제목")).toBeNull();
    expect(syncTitleHeading("## 옛 제목\n", "옛 제목", "새 제목")).toBeNull();
    expect(syncTitleHeading("", "옛 제목", "새 제목")).toBeNull();
    expect(syncTitleHeading("# 새 제목\n", "옛 제목", "새 제목")).toBeNull();
  });
});
