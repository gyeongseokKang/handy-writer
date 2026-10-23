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

const embeds = () => {
  const found: Record<string, unknown>[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "embed") found.push(node.attrs);
  });
  return found;
};

afterEach(() => editor?.destroy());

describe("임베드 마크다운 왕복", () => {
  it.each([
    "![[a.png]]",
    "![[a.png|300]]",
    "![[a.png|300x200]]",
    "![[a.png|여행 사진]]",
    "![[a.png|여행 사진|300]]",
    "![[attachments/내 사진 (1).png|그림 1|300x200]]",
    "앞 ![[a.png|라벨|300]] 뒤",
    "![[다른 글]]",
    "![[논문.pdf]]",
  ])("%s 를 그대로 되돌린다", (markdown) => {
    mount(markdown);
    expect(editor.getMarkdown()).toBe(markdown);
    expect(embeds()).toHaveLength(1);
  });

  it("라벨과 크기를 값으로 읽는다", () => {
    mount("![[a.png|여행 사진|300x200]]");
    expect(embeds()[0]).toMatchObject({ target: "a.png", label: "여행 사진", width: 300, height: 200, syntax: "wiki" });
  });

  it("일반 마크다운 이미지도 읽고 같은 문법으로 되돌린다 (공백은 %20, 제목과 원격 주소 유지)", () => {
    for (const markdown of [
      "![사진](attachments/a.png)",
      "![사진|200](attachments/내%20사진.png)",
      '![사진|200x100](https://example.com/a.png "제목")',
      "![](a.png)",
    ]) {
      mount(markdown);
      expect(editor.getMarkdown()).toBe(markdown);
      expect(embeds()[0]).toMatchObject({ syntax: "markdown" });
      editor.destroy();
    }
    mount("![사진|200](attachments/내%20사진.png)");
    expect(embeds()[0]).toMatchObject({ target: "attachments/내 사진.png", label: "사진", width: 200 });
  });

  it("임베드 앞의 !가 글자로 남지 않고, 위키링크와 한 줄에 있어도 둘 다 인식한다", () => {
    mount("![[a.png]] 와 [[링크]]");
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toContain('"text":"!"');
    expect(json.match(/"type":"embed"/g)).toHaveLength(1);
    expect(json.match(/"type":"wikiLink"/g)).toHaveLength(1);
    expect(editor.getMarkdown()).toBe("![[a.png]] 와 [[링크]]");
  });

  it("같은 파일을 두 번 넣어도 임베드마다 서로 다른 uid를 갖는다", () => {
    mount("![[a.png]]\n\n![[a.png]]");
    const [first, second] = embeds();
    expect(first?.["uid"]).toBeTruthy();
    expect(second?.["uid"]).toBeTruthy();
    expect(first?.["uid"]).not.toBe(second?.["uid"]);
  });

  it("직접 타이핑한 ![[파일]]이 임베드가 된다", () => {
    mount("");
    editor.commands.focus("end");
    for (const char of "![[a.png|라벨|300]]") {
      const { from, to } = editor.state.selection;
      const insert = () => editor.state.tr.insertText(char, from, to);
      const handled = editor.view.someProp("handleTextInput", (h) => h(editor.view, from, to, char, insert));
      if (!handled) editor.view.dispatch(insert());
    }
    expect(editor.getMarkdown()).toBe("![[a.png|라벨|300]]");
    expect(embeds()).toHaveLength(1);
  });
});

describe("브리지의 임베드 편집", () => {
  it("글 안의 순서대로 목록을 돌려준다", () => {
    const bridge = mount("![[a.png|첫째|100]]\n\n중간 글\n\n![[b.webm]]");
    expect(bridge.listEmbeds().map((e) => [e.target, e.label, e.width])).toEqual([
      ["a.png", "첫째", 100],
      ["b.webm", "", null],
    ]);
  });

  it("라벨과 크기를 고치면 마크다운에 반영되고, 비우면 사라진다", () => {
    const bridge = mount("![[a.png]]");
    const [item] = bridge.listEmbeds();
    expect(item).toBeDefined();

    expect(bridge.updateEmbed(item!.uid, { label: "새 라벨", width: 400 })).toBe(true);
    expect(editor.getMarkdown()).toBe("![[a.png|새 라벨|400]]");

    bridge.updateEmbed(item!.uid, { height: 250 });
    expect(editor.getMarkdown()).toBe("![[a.png|새 라벨|400x250]]");

    bridge.updateEmbed(item!.uid, { label: "", width: null, height: null });
    expect(editor.getMarkdown()).toBe("![[a.png]]");
  });

  it("일반 마크다운 문법으로 쓰인 임베드는 고쳐도 그 문법을 유지한다", () => {
    const bridge = mount("![사진](attachments/a.png)");
    bridge.updateEmbed(bridge.listEmbeds()[0]!.uid, { label: "바뀜", width: 200 });
    expect(editor.getMarkdown()).toBe("![바뀜|200](attachments/a.png)");
  });

  it("없는 uid는 고치지도 지우지도 못한다", () => {
    const bridge = mount("![[a.png]]");
    expect(bridge.updateEmbed("없음", { label: "x" })).toBe(false);
    expect(bridge.removeEmbed("없음")).toBe(false);
    expect(bridge.focusEmbed("없음")).toBe(false);
  });

  it("임베드만 있던 문단은 빈 문단을 남기지 않고 지우고, 글 중간의 임베드는 그 부분만 지운다", () => {
    const bridge = mount("앞 글\n\n![[a.png]]\n\n뒤 글 ![[b.png]] 끝");
    const [first, second] = bridge.listEmbeds();
    bridge.removeEmbed(first!.uid);
    expect(editor.getMarkdown()).toBe("앞 글\n\n뒤 글 ![[b.png]] 끝");
    bridge.removeEmbed(second!.uid);
    expect(editor.getMarkdown()).toBe("앞 글\n\n뒤 글  끝");
  });

  it("임베드를 선택하고 새 임베드를 삽입한다", () => {
    const bridge = mount("![[a.png]]\n\n끝");
    expect(bridge.focusEmbed(bridge.listEmbeds()[0]!.uid)).toBe(true);
    expect(editor.state.selection.constructor.name).toBe("NodeSelection");

    editor.commands.focus("end");
    bridge.insertEmbeds(["b.png", "attachments/c d.webm"]);
    expect(editor.getMarkdown()).toContain("![[b.png]]");
    expect(editor.getMarkdown()).toContain("![[attachments/c d.webm]]");
    expect(bridge.listEmbeds().map((e) => e.target)).toEqual(["a.png", "b.png", "attachments/c d.webm"]);
  });
});
