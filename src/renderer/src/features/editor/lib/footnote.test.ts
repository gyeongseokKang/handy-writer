// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createExtensions } from "./create-extensions";
import { collectFootnotes } from "./footnote";

let editor: Editor;

function mount(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
  return editor;
}

afterEach(() => editor?.destroy());

describe("각주", () => {
  it("본문의 [^1]과 내용 줄 [^1]: 을 읽고 그대로 다시 쓴다", () => {
    const source = "첫 문장[^1] 그리고 둘째[^note].\n\n[^1]: 첫 각주 **굵게**\n\n[^note]: 이름 붙인 각주";
    mount(source);
    expect(editor.getMarkdown()).toBe(source);
    const types: string[] = [];
    editor.state.doc.descendants((node) => void types.push(node.type.name));
    expect(types.filter((t) => t.startsWith("footnote"))).toEqual(["footnoteRef", "footnoteRef", "footnoteDef", "footnoteDef"]);
  });

  it("내용 줄의 들여 쓴 이어지는 줄은 한 문단으로 합친다", () => {
    mount("본문[^1]\n\n[^1]: 첫 줄\n    이어지는 줄");
    expect(editor.getMarkdown()).toBe("본문[^1]\n\n[^1]: 첫 줄 이어지는 줄");
  });

  it("[^1]: 이 주소여도 링크 정의로 사라지지 않는다", () => {
    mount("본문[^1]\n\n[^1]: https://example.com");
    // 맨 주소는 앱 전체에서 자동 링크가 되므로, 각주 내용 줄로 남아 있는지만 본다.
    expect(editor.getMarkdown()).toMatch(/^\[\^1\]: .*https:\/\/example\.com/m);
  });

  it("본문에 처음 나온 순서로 번호를 매기고 내용을 찾는다", () => {
    mount("가[^b] 나[^a] 다[^b]\n\n[^a]: 에이\n\n[^b]: 비\n\n[^z]: 안 쓴 각주");
    const notes = collectFootnotes(editor.state.doc);
    expect([...notes.values()].map((n) => [n.label, n.number, n.text])).toEqual([
      ["b", 1, "비"],
      ["a", 2, "에이"],
      ["z", 3, "안 쓴 각주"],
    ]);
  });

  it("각주 넣기는 다음 번호로 표시를 넣고 글 끝에 내용 줄을 만들어 커서를 옮긴다", () => {
    mount("문장[^1]\n\n[^1]: 하나");
    editor.commands.setTextSelection(3);
    editor.commands.insertFootnote();
    editor.commands.insertContent("둘");
    expect(editor.getMarkdown().trimEnd()).toBe("문장[^2][^1]\n\n[^1]: 하나\n\n[^2]: 둘");
  });

  it("번호 표시와 없는 각주 표시를 붙인다", () => {
    mount("가[^1] 나[^2]\n\n[^1]: 하나");
    const sups = [...editor.view.dom.querySelectorAll("sup.footnote-ref")];
    expect(sups.map((s) => s.getAttribute("data-number"))).toEqual(["1", "2"]);
    expect(sups[0]?.getAttribute("title")).toBe("하나");
    expect(sups[1]?.classList.contains("footnote-missing")).toBe(true);
  });
});
