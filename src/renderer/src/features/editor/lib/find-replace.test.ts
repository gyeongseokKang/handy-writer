// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createExtensions } from "./create-extensions";
import { clearFind, getFindState, replaceAll, replaceCurrent, setFind, stepFind } from "./find-replace";

let editor: Editor;

function mount(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
}

afterEach(() => editor?.destroy());

describe("글 안에서 찾기", () => {
  it("여러 문단에서 일치하는 자리를 모두 찾고 대소문자는 구분하지 않는다", () => {
    mount("Apple pie\n\n사과 apple\n\n- APPLE");
    setFind(editor, "apple");
    expect(getFindState(editor).matches).toHaveLength(3);
    setFind(editor, "apple", true);
    expect(getFindState(editor).matches).toHaveLength(1);
  });

  it("다음·이전으로 돌고 끝에서는 반대쪽 끝으로 간다", () => {
    mount("a a a");
    setFind(editor, "a");
    expect(getFindState(editor).current).toBe(0);
    stepFind(editor, -1);
    expect(getFindState(editor).current).toBe(2);
    stepFind(editor, 1);
    expect(getFindState(editor).current).toBe(0);
  });

  it("글을 고치면 일치 목록이 다시 계산된다", () => {
    mount("가나 가나");
    setFind(editor, "가나");
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " 가나");
    expect(getFindState(editor).matches).toHaveLength(3);
  });

  it("지금 항목만 바꾸면 다음 항목을 가리킨다", () => {
    mount("one two one two one");
    setFind(editor, "one");
    expect(replaceCurrent(editor, "1")).toBe(true);
    expect(editor.getText()).toBe("1 two one two one");
    expect(getFindState(editor)).toMatchObject({ current: 0, matches: expect.any(Array) });
    expect(getFindState(editor).matches).toHaveLength(2);
  });

  it("모두 바꾸기는 한 번에 바꾸고 한 번에 되돌린다", () => {
    mount("one two one\n\nthree one");
    setFind(editor, "one");
    expect(replaceAll(editor, "하나")).toBe(3);
    expect(editor.getText({ blockSeparator: "\n" })).toBe("하나 two 하나\nthree 하나");
    editor.commands.undo();
    expect(editor.getText({ blockSeparator: "\n" })).toBe("one two one\nthree one");
  });

  it("지우면 표시도 사라진다", () => {
    mount("abc");
    setFind(editor, "b");
    clearFind(editor);
    expect(getFindState(editor)).toMatchObject({ query: "", matches: [], current: -1 });
  });
});
