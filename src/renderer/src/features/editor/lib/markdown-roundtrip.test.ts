// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { serializeNote, splitFrontmatter } from "@shared/frontmatter";

import { createExtensions } from "./create-extensions";

function roundTrip(markdown: string) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
    content: markdown,
    contentType: "markdown",
  });
  const output = editor.getMarkdown();
  const json = JSON.stringify(editor.getJSON());
  editor.destroy();
  return { output, json };
}

/** 키보드 입력을 흉내 낸다. ProseMirror의 handleTextInput(입력 규칙 포함)을 먼저 거치고, 처리되지 않으면 글자를 넣는다. */
function typeText(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp("handleTextInput", (handler) => handler(editor.view, from, to, char, insert));
    if (!handled) editor.view.dispatch(insert());
  }
}

describe("직접 타이핑한 [[위키링크]]", () => {
  it("끝까지 입력하면 `[[`나 `]]` 글자가 남지 않고 링크 노드 하나가 된다", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
      content: "",
      contentType: "markdown",
    });
    editor.commands.focus("end");
    typeText(editor, "앞 [[노트#절|별칭]] 뒤");
    expect(editor.getMarkdown()).toBe("앞 [[노트#절|별칭]] 뒤");
    expect(JSON.stringify(editor.getJSON()).match(/"type":"wikiLink"/g)).toHaveLength(1);
    editor.destroy();
  });
});

describe("마크다운 왕복 (옵시디언 호환)", () => {
  it("위키링크를 이스케이프하지 않고 링크 노드로 인식한다", () => {
    const md = "앞 [[다른 글#섹션]] 중간 [[글|별칭]] 끝.";
    const { output, json } = roundTrip(md);
    expect(output).toBe(md);
    expect(json.match(/"type":"wikiLink"/g)).toHaveLength(2);
  });

  it("콜아웃의 종류, 제목, 여러 문단을 그대로 보존한다", () => {
    const md = "> [!tip] 팁 제목\n> 첫 문단\n>\n> 둘째 문단";
    const { output, json } = roundTrip(md);
    expect(output).toBe(md);
    expect(json).toContain('"type":"callout"');
    expect(json).toContain('"calloutType":"tip"');
  });

  it("제목 없는 콜아웃도 보존하고, 일반 인용문은 콜아웃으로 바꾸지 않는다", () => {
    expect(roundTrip("> [!warning]\n> 조심").output).toBe("> [!warning]\n> 조심");
    const quote = roundTrip("> 그냥 인용");
    expect(quote.output).toBe("> 그냥 인용");
    expect(quote.json).not.toContain('"type":"callout"');
  });

  it("제목, 서식, 목록, 할 일, 코드 블록을 보존한다", () => {
    const md = [
      "# 제목",
      "",
      "본문 **굵게** *기울임* `코드`",
      "",
      "- 항목 1",
      "- 항목 2",
      "",
      "1. 첫째",
      "2. 둘째",
      "",
      "- [ ] 할 일",
      "- [x] 끝낸 일",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    expect(roundTrip(md).output).toBe(md);
  });

  it("frontmatter가 있는 파일을 저장해도 frontmatter와 본문이 그대로다", () => {
    const raw = "---\ntitle: 테스트\ntags: [a, b]\n---\n\n# 제목\n\n[[다른 글]] 링크\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(serializeNote(frontmatter, roundTrip(body).output)).toBe(raw);
  });
});

describe("코드블록", () => {
  it("언어와 내용을 그대로 되돌린다", () => {
    const markdown = '```tsx\nconst a = <Button size="md" />;\n\tindent();\n```';
    const { output, json } = roundTrip(markdown);
    expect(output.trim()).toBe(markdown);
    expect(json).toContain('"language":"tsx"');
  });

  it("언어가 없는 코드블록도 그대로 되돌린다", () => {
    expect(roundTrip("```\nplain text\n```").output.trim()).toBe("```\nplain text\n```");
  });

  it("문법에 맞춰 색을 입힌다", () => {
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false }),
      content: "```ts\nconst answer: number = 42;\n```",
      contentType: "markdown",
    });
    expect(element.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(element.querySelector(".hljs-number")?.textContent).toBe("42");
    editor.destroy();
  });
});
