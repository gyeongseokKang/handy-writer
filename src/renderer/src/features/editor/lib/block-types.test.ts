// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { BLOCK_TYPES, currentBlockType } from "./block-types";
import { duplicateBlock, moveBlock } from "./block-moves";
import { createExtensions } from "./create-extensions";

function make(markdown: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
}

/** 글자 text가 든 블록 안으로 커서를 옮긴다. */
function select(editor: Editor, text: string) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isText && node.text?.includes(text)) found = pos + node.text.indexOf(text);
    return found === -1;
  });
  if (found === -1) throw new Error(`${text}를 찾지 못했어요`);
  editor.commands.setTextSelection(found + 1);
}

const type = (id: string) => BLOCK_TYPES.find((t) => t.id === id)!;

describe("블록 종류 바꾸기", () => {
  it("본문을 제목·목록·인용·코드로, 다시 본문으로 바꾼다", () => {
    const editor = make("첫째\n\n둘째\n\n셋째");
    select(editor, "둘째");
    type("h2").set(editor);
    expect(editor.getMarkdown().trim()).toBe("첫째\n\n## 둘째\n\n셋째");
    expect(currentBlockType(editor).id).toBe("h2");
    type("bullet").set(editor);
    expect(editor.getMarkdown().trim()).toBe("첫째\n\n- 둘째\n\n셋째");
    type("ordered").set(editor);
    expect(editor.getMarkdown().trim()).toBe("첫째\n\n1. 둘째\n\n셋째");
    type("quote").set(editor);
    expect(editor.getMarkdown().trim()).toBe("첫째\n\n> 둘째\n\n셋째");
    type("task").set(editor);
    expect(editor.getMarkdown().trim()).toBe("첫째\n\n- [ ] 둘째\n\n셋째");
    type("code").set(editor);
    expect(editor.getMarkdown()).toContain("```\n둘째\n```");
    type("paragraph").set(editor);
    expect(editor.getMarkdown().trim()).toBe("첫째\n\n둘째\n\n셋째");
    expect(currentBlockType(editor).id).toBe("paragraph");
    editor.destroy();
  });

  it("목록 안에서도 제목으로 바뀌고, 이미 그 종류면 그대로 둔다", () => {
    const editor = make("- 가\n- 나");
    select(editor, "가");
    type("h3").set(editor);
    expect(editor.getMarkdown().trim()).toBe("### 가\n\n- 나");
    type("h3").set(editor);
    expect(editor.getMarkdown().trim()).toBe("### 가\n\n- 나");
    editor.destroy();
  });
});

describe("블록 옮기기와 복제", () => {
  it("위·아래로 옮기고 선택은 그 블록 안에 남는다", () => {
    const editor = make("가\n\n나\n\n다");
    select(editor, "나");
    expect(moveBlock(editor, -1)).toBe(true);
    expect(editor.getMarkdown().trim()).toBe("나\n\n가\n\n다");
    expect(editor.state.selection.$from.parent.textContent).toBe("나");
    moveBlock(editor, 1);
    moveBlock(editor, 1);
    expect(editor.getMarkdown().trim()).toBe("가\n\n다\n\n나");
    expect(editor.state.selection.$from.parent.textContent).toBe("나");
    // 맨 아래에서 더 내려도 그대로
    moveBlock(editor, 1);
    expect(editor.getMarkdown().trim()).toBe("가\n\n다\n\n나");
    editor.destroy();
  });

  it("목록은 통째로 옮긴다", () => {
    const editor = make("앞\n\n- 하나\n- 둘\n\n뒤");
    select(editor, "둘");
    moveBlock(editor, 1);
    expect(editor.getMarkdown().trim()).toBe("앞\n\n뒤\n\n- 하나\n- 둘");
    editor.destroy();
  });

  it("복제하면 바로 아래에 같은 블록이 생기고 선택이 복사본으로 옮겨 간다", () => {
    const editor = make("## 제목\n\n본문");
    select(editor, "제목");
    expect(duplicateBlock(editor)).toBe(true);
    expect(editor.getMarkdown().trim()).toBe("## 제목\n\n## 제목\n\n본문");
    expect(editor.state.selection.$from.index(0)).toBe(1);
    editor.destroy();
  });
});
