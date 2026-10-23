// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createExtensions } from "./create-extensions";

let editor: Editor | undefined;

function mount(markdown: string, overrides: { isResolved?: (t: string) => boolean; onTagClick?: (t: string) => void } = {}) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: createExtensions({
      getNoteNames: () => [],
      onNavigate: () => {},
      isResolved: overrides.isResolved ?? (() => true),
      onTagClick: overrides.onTagClick ?? (() => {}),
      renderEmbeds: false,
    }),
    content: markdown,
    contentType: "markdown",
  });
  return element;
}

afterEach(() => {
  editor?.destroy();
  editor = undefined;
  document.body.innerHTML = "";
});

describe("#태그 강조", () => {
  it("본문의 태그만 칩으로 표시하고 코드, 위키링크 섹션, 숫자는 제외한다", () => {
    const el = mount("오늘 #글쓰기 와 `#코드` 그리고 [[노트#섹션]] 또 #123 과 #project/a");
    const tags = [...el.querySelectorAll<HTMLElement>(".note-tag")].map((t) => t.dataset["tag"]);
    expect(tags).toEqual(["글쓰기", "project/a"]);
  });

  it("코드 블록 안의 #은 칩이 아니다", () => {
    const el = mount("```\n#블록\n```\n\n#밖");
    expect([...el.querySelectorAll<HTMLElement>(".note-tag")].map((t) => t.dataset["tag"])).toEqual(["밖"]);
  });

  it("위키링크가 앞에 있어도 태그 글자 위치가 맞는다", () => {
    const el = mount("[[링크]] 뒤 #태그");
    const chip = el.querySelector<HTMLElement>(".note-tag");
    expect(chip?.textContent).toBe("#태그");
  });

  it("태그를 누르면 onTagClick을 부른다", () => {
    const clicked: string[] = [];
    const el = mount("#글쓰기", { onTagClick: (t) => clicked.push(t) });
    el.querySelector<HTMLElement>(".note-tag")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicked).toEqual(["글쓰기"]);
  });
});

describe("없는 글로 가는 위키링크", () => {
  it("가리키는 글이 없는 링크에만 wikilink-missing을 붙인다", () => {
    const el = mount("[[있는 글]] [[없는 글]]", { isResolved: (t) => t === "있는 글" });
    const links = [...el.querySelectorAll<HTMLElement>(".wikilink")];
    expect(links.map((l) => [l.dataset["wikilink"], l.classList.contains("wikilink-missing")])).toEqual([
      ["있는 글", false],
      ["없는 글", true],
    ]);
  });
});
