// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  return createEditorBridge(editor, () => "테스트 글");
}

/** 문서 안에서 문자열의 위치를 찾아 그 범위를 선택한다. */
function select(text: string) {
  let found: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return;
    const index = node.text?.indexOf(text) ?? -1;
    if (index >= 0) found = { from: pos + index, to: pos + index + text.length };
  });
  if (!found) throw new Error(`못 찾았어요: ${text}`);
  const { from, to } = found as { from: number; to: number };
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)));
}

afterEach(() => editor?.destroy());

describe("에디터 브리지", () => {
  it("목차용 제목 목록과 커서가 속한 제목을 준다", () => {
    const bridge = mount("# 큰 제목\n\n본문\n\n## 첫째 장\n\n첫째 내용\n\n### 소제목\n\n> ## 인용 속 제목\n\n## \n\n## 둘째 장\n\n끝");
    const headings = bridge.listHeadings();
    // 맨 위 단계의 제목만, 빈 제목은 빼고
    expect(headings.map((h) => [h.level, h.text])).toEqual([[1, "큰 제목"], [2, "첫째 장"], [3, "소제목"], [2, "둘째 장"]]);

    select("첫째 내용");
    expect(bridge.currentHeadingPos()).toBe(headings[1]?.pos);
    select("끝");
    expect(bridge.currentHeadingPos()).toBe(headings[3]?.pos);

    // jsdom에는 scrollIntoView가 없다.
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    expect(bridge.focusHeading(headings[2]!.pos)).toBe(true);
    expect(scrolled).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(bridge.currentHeadingPos()).toBe(headings[2]?.pos);
    expect(bridge.focusHeading(1)).toBe(false);
  });

  it("선택이 없으면 본문 전체를, 있으면 선택한 글만 컨텍스트로 준다", () => {
    const bridge = mount("첫째 문단 [[링크]]\n\n둘째 문단");
    expect(bridge.getContext()).toMatchObject({ hasSelection: false, text: "첫째 문단 [[링크]]\n\n둘째 문단", noteName: "테스트 글" });

    select("둘째");
    expect(bridge.getContext()).toMatchObject({ hasSelection: true, text: "둘째", before: "첫째 문단 [[링크]]" });
  });

  it("이어쓰기 컨텍스트에는 커서 앞의 글, 같은 문단에서 커서 뒤에 남은 글, 커서 자리가 들어 있다", () => {
    const bridge = mount("첫째 문단입니다.\n\n둘째 문단은 여기서 끝납니다.\n\n셋째");
    // "여기서" 앞에 커서를 둔다.
    let at = -1;
    editor.state.doc.descendants((node, pos) => {
      if (at === -1 && node.isText && node.text?.includes("여기서")) at = pos + (node.text.indexOf("여기서") ?? 0);
    });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
    const context = bridge.getContext();
    expect(context).toMatchObject({ hasSelection: false, before: "첫째 문단입니다.\n\n둘째 문단은", after: "여기서 끝납니다.", cursor: at });
    // 문단 끝이면 남은 글이 없다.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at + "여기서 끝납니다.".length)));
    expect(bridge.getContext().after).toBe("");
  });

  it("이어 붙이기는 커서 자리에 글을 이어 쓰고, 앞뒤 말이 붙지 않게 띄운다", () => {
    const bridge = mount("앞 글 뒤 글");
    select("앞 글");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.selection.to)));
    const context = bridge.getContext();
    expect(bridge.appendAtCursor(context, "덧붙인 [[링크]]")).toBe("ok");
    expect(editor.getMarkdown()).toBe("앞 글 덧붙인 [[링크]] 뒤 글");
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"wikiLink"');
  });

  it("문단 끝이거나 마침표가 오면 불필요한 공백을 넣지 않는다", () => {
    const bridge = mount("끝난 문장입니다.");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.doc.content.size - 1)));
    expect(bridge.appendAtCursor(bridge.getContext(), "이어지는 문장입니다.")).toBe("ok");
    expect(editor.getMarkdown()).toBe("끝난 문장입니다. 이어지는 문장입니다.");
  });

  it("요청한 뒤에 커서 앞의 글이 바뀌었으면 이어 붙이지 않는다", () => {
    const bridge = mount("앞 글");
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.doc.content.size - 1)));
    const context = bridge.getContext();
    editor.commands.insertContentAt(1, "새로 쓴 ");
    expect(bridge.appendAtCursor(context, "이어 쓴 글")).toBe("changed");
    expect(editor.getMarkdown()).toBe("새로 쓴 앞 글");
  });

  it("선택한 부분만 바꾸고 나머지 문장과 위키링크는 그대로 둔다", () => {
    const bridge = mount("앞 [[링크]] 문단 뒤");
    select("문단");
    const context = bridge.getContext();
    expect(bridge.replace(context, "단락")).toBe("ok");
    expect(editor.getMarkdown()).toBe("앞 [[링크]] 단락 뒤");
  });

  it("바꾼 글 안의 마크다운(위키링크, 서식)을 서식으로 되살린다", () => {
    const bridge = mount("교정 전 문장");
    select("교정 전");
    expect(bridge.replace(bridge.getContext(), "**교정 후** [[참고 글]]")).toBe("ok");
    expect(editor.getMarkdown()).toBe("**교정 후** [[참고 글]] 문장");
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"wikiLink"');
  });

  it("선택 없이 요청했으면 본문 전체를 바꾼다", () => {
    const bridge = mount("옛 첫째\n\n옛 둘째");
    const context = bridge.getContext();
    expect(bridge.replace(context, "# 새 제목\n\n새 본문")).toBe("ok");
    expect(editor.getMarkdown()).toBe("# 새 제목\n\n새 본문");
  });

  it("요청한 뒤 그 부분이 바뀌었으면 덮어쓰지 않는다", () => {
    const bridge = mount("앞 문단 뒤");
    select("문단");
    const context = bridge.getContext();
    editor.commands.insertContentAt(context.from, "새로 쓴 ");
    expect(bridge.replace(context, "단락")).toBe("changed");
    expect(editor.getMarkdown()).toBe("앞 새로 쓴 문단 뒤");
  });

  it("검색어가 처음 나오는 위치를 선택한다 (위키링크 앞에 있어도 위치가 맞는다)", () => {
    const bridge = mount("앞 문단\n\n[[링크]] 뒤에 찾는말이 있다. 또 찾는말");
    expect(bridge.findAndSelect("찾는말")).toBe(true);
    const { from, to } = editor.state.selection;
    expect(editor.state.doc.textBetween(from, to)).toBe("찾는말");
    expect(bridge.findAndSelect("없는 단어")).toBe(false);
    expect(bridge.findAndSelect("  ")).toBe(false);
  });

  it("커서가 있는 블록 아래에 새 블록으로 삽입한다", () => {
    const bridge = mount("첫째 문단\n\n둘째 문단");
    select("첫째");
    bridge.insertBelowCursor("이어서 쓴 글 [[출처]]");
    expect(editor.getMarkdown()).toBe("첫째 문단\n\n이어서 쓴 글 [[출처]]\n\n둘째 문단");
  });
});
