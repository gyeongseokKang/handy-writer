// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createEditorBridge } from "./editor-bridge";
import { createExtensions } from "./create-extensions";

let editor: Editor;

function mount(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
  return createEditorBridge(editor, () => "테스트");
}
const md = () => editor.getMarkdown().trim();
const cursorInBlock = (index: number) => {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  editor.commands.setTextSelection(pos + 1);
};

afterEach(() => editor?.destroy());

describe("이미지 나란히 놓기", () => {
  it("이미지만 둘 이상 든 문단은 묶음으로 그리고, 칸 수를 정한다", () => {
    mount("![[a.png]] ![[b.png]] ![[c.png]] ![[d.png]]\n\n![[e.png]]\n\n글 ![[f.png]] ![[g.png]]\n\n![[h.pdf]] ![[i.png]]");
    const rows = [...editor.view.dom.querySelectorAll<HTMLElement>("p.image-row")];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.style.getPropertyValue("--cols")).toBe("2");
  });

  it("여러 이미지를 한꺼번에 넣으면 한 줄로 놓고 아래에 라벨 캡션을 만들어 커서를 둔다", () => {
    const bridge = mount("앞 글");
    bridge.insertEmbeds(["a.png", "b.png", "c.png"]);
    expect(md()).toBe("앞 글\n\n![[a.png]] ![[b.png]] ![[c.png]]\n\n ^fig-1");
    // 커서는 캡션 문단 맨 앞이라 바로 라벨을 쓴다.
    editor.commands.insertContent("세 장 비교");
    expect(md()).toContain("세 장 비교 ^fig-1");
  });

  it("이미지가 하나면 예전처럼 한 줄에 하나, 영상은 묶음에 넣지 않는다", () => {
    const bridge = mount("앞 글");
    bridge.insertEmbeds(["a.png"]);
    expect(md()).toContain("![[a.png]]");
    expect(editor.view.dom.querySelectorAll("p.image-row")).toHaveLength(0);
    bridge.insertEmbeds(["b.png", "영상.mp4", "c.png"]);
    expect(md()).toContain("![[영상.mp4]]");
    expect(md()).toContain("![[b.png]] ![[c.png]]");
    expect(editor.view.dom.querySelectorAll("p.image-row")).toHaveLength(1);
  });

  it("이어진 이미지 문단을 한 줄로 합치고 라벨 캡션을 만든다. 이미 캡션이 있으면 그대로 쓴다", () => {
    const bridge = mount("![[a.png]]\n\n![[b.png]]\n\n글\n\n![[c.png]]");
    cursorInBlock(0);
    expect(bridge.arrangeImages()).toBe(true);
    expect(md()).toBe("![[a.png]] ![[b.png]]\n\n ^fig-1\n\n글\n\n![[c.png]]");

    // 라벨이 이미 있으면 새로 만들지 않는다.
    const second = mount("![[a.png]]\n\n![[b.png]]\n\n설명 ^fig-x\n\n끝");
    cursorInBlock(1);
    expect(second.arrangeImages()).toBe(true);
    expect(md()).toBe("![[a.png]] ![[b.png]]\n\n설명 ^fig-x\n\n끝");
  });

  it("글 문단이나 이미지가 하나뿐인 곳에서는 합치지 않는다", () => {
    const bridge = mount("글\n\n![[a.png]]\n\n글");
    cursorInBlock(0);
    expect(bridge.arrangeImages()).toBe(false);
    cursorInBlock(1);
    expect(bridge.arrangeImages()).toBe(false);
    expect(md()).toBe("글\n\n![[a.png]]\n\n글");
  });

  it("나란히 놓은 줄을 하나씩 위아래로 푼다", () => {
    const bridge = mount("![[a.png]] ![[b.png]]\n\n설명 ^fig-1");
    cursorInBlock(0);
    expect(bridge.splitImageRow()).toBe(true);
    expect(md()).toBe("![[a.png]]\n\n![[b.png]]\n\n설명 ^fig-1");
    expect(bridge.splitImageRow()).toBe(false);
  });
});
