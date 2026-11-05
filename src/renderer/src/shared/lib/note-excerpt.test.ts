import { describe, expect, it } from "vitest";

import { noteExcerpt } from "./note-excerpt";

describe("noteExcerpt", () => {
  it("drops frontmatter and code, strips markdown, and keeps headings", () => {
    const raw = "---\ntags: [a]\n---\n# 제목\n\n**굵게** 쓴 [[다른 글|별칭]]과 [[이름]]\n\n```js\ncode()\n```\n\n- [ ] 할 일\n![[그림.png]]\n---\n> [!note] 콜아웃\n";
    expect(noteExcerpt(raw).lines).toEqual([
      { text: "제목", heading: true },
      { text: "굵게 쓴 별칭과 이름", heading: false },
      { text: "• 할 일", heading: false },
      { text: "[그림]", heading: false },
      { text: "콜아웃", heading: false },
    ]);
  });
  it("cuts long text with an ellipsis", () => {
    const { lines, truncated } = noteExcerpt("가".repeat(50), 10);
    expect(truncated).toBe(true);
    expect(lines[0]!.text).toBe(`${"가".repeat(10)}…`);
  });
});
