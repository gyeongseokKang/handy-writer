// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createExtensions } from "./create-extensions";
import { createSourceKeeper } from "./source-keeper";

let editor: Editor;

function open(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
  const keeper = createSourceKeeper(editor);
  keeper.setBase(markdown);
  return keeper;
}

afterEach(() => editor?.destroy());

const NOTE = [
  "# 제목",
  "",
  "주소는 https://example.com 이에요.",
  "",
  "| 이름 | 점수 |",
  "|---|---|",
  "| 가 | 1 |",
  "",
  "",
  "* 별표 목록",
  "* 둘째",
  "",
  "마지막 문단 ^fig-1",
].join("\n");

describe("마크다운 원문 보존", () => {
  it("아무것도 안 고치면 원문이 그대로 나온다 (에디터는 표 간격·주소·목록 기호를 바꾼다)", () => {
    const keeper = open(NOTE);
    expect(editor.getMarkdown()).not.toBe(NOTE);
    expect(keeper.serialize()).toBe(NOTE);
  });

  it("한 문단만 고치면 그 문단만 바뀌고 나머지 원문은 그대로다", () => {
    const keeper = open(NOTE);
    const pos = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + editor.state.doc.child(2).nodeSize + editor.state.doc.child(3).nodeSize;
    editor.commands.insertContentAt(pos + editor.state.doc.child(4).nodeSize - 1, " 덧붙임");
    expect(keeper.serialize()).toBe(NOTE.replace("마지막 문단 ^fig-1", "마지막 문단 ^fig-1 덧붙임"));
  });

  it("문단을 새로 넣거나 지워도 다른 블록은 원문 그대로다", () => {
    const keeper = open(NOTE);
    editor.commands.insertContentAt(editor.state.doc.child(0).nodeSize, { type: "paragraph", content: [{ type: "text", text: "새 문단" }] });
    expect(keeper.serialize()).toBe(NOTE.replace("# 제목\n\n", "# 제목\n\n새 문단\n\n"));
    // 두 번째 블록(새 문단) 지우기 → 원래대로
    const first = editor.state.doc.child(0).nodeSize;
    editor.commands.deleteRange({ from: first, to: first + editor.state.doc.child(1).nodeSize });
    expect(keeper.serialize()).toBe(NOTE);
  });

  it("블록 순서를 바꿔도 각 블록의 원문은 그대로다", () => {
    const keeper = open("첫째 https://a.com\n\n둘째\n");
    const first = editor.state.doc.child(0);
    editor.commands.deleteRange({ from: 0, to: first.nodeSize });
    editor.commands.insertContentAt(editor.state.doc.content.size, first.toJSON());
    expect(keeper.serialize()).toBe("둘째\n\n첫째 https://a.com");
  });

  it("원문을 블록과 맞출 수 없으면 에디터의 전체 출력을 쓴다", () => {
    const keeper = open("가\n\n\n\n\n나\n");
    expect(keeper.serialize()).toBe(editor.getMarkdown());
  });

  it("저장한 뒤 새 원문을 기억하면 다음 저장도 그 원문을 기준으로 한다", () => {
    const keeper = open(NOTE);
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph", content: [{ type: "text", text: "끝" }] });
    const saved = keeper.serialize();
    keeper.setBase(saved);
    expect(keeper.serialize()).toBe(saved);
    expect(saved.startsWith(NOTE)).toBe(true);
  });
});
