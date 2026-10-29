// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createExtensions } from "./create-extensions";
import { collectLabels, labelName } from "./cross-ref";

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

const SOURCE = [
  "[[#^tbl-score]]와 [[#^fig-b]]를 보세요. [[#^fig-a]]도요.",
  "",
  "![[a.png]]",
  "",
  "첫 그림 설명 ^fig-a",
  "",
  "| 이름 | 점수 |",
  "| --- | --- |",
  "| 가 | 1 |",
  "",
  "점수 표 ^tbl-score",
  "",
  "![[b.png]]",
  "",
  "둘째 그림 ^fig-b",
  "",
  "다른 문단 ^plain",
].join("\n");

describe("그림·표 번호", () => {
  it("블록 ID를 종류별로 나온 순서대로 번호 매긴다", () => {
    mount(SOURCE);
    const labels = [...collectLabels(editor.state.doc).values()].map((l) => [l.id, labelName(l), l.caption]);
    expect(labels).toEqual([
      ["fig-a", "그림 1", "첫 그림 설명"],
      ["tbl-score", "표 1", "점수 표"],
      ["fig-b", "그림 2", "둘째 그림"],
      ["plain", "plain", "다른 문단"],
    ]);
  });

  it("파일에는 문법 그대로 남는다 (Obsidian 블록 링크와 호환)", () => {
    mount(SOURCE);
    // 표는 에디터가 칸을 맞춰 다시 쓰므로, 블록 ID와 참조가 그대로인지만 본다.
    const out = editor.getMarkdown();
    for (const piece of ["[[#^tbl-score]]와 [[#^fig-b]]를 보세요. [[#^fig-a]]도요.", "첫 그림 설명 ^fig-a", "점수 표 ^tbl-score", "둘째 그림 ^fig-b", "다른 문단 ^plain"]) {
      expect(out).toContain(piece);
    }
  });

  it("캡션 앞에 번호를 붙이고, 참조는 번호로 보여 주고, 없는 ID는 표시한다", () => {
    mount(`${SOURCE}\n\n[[#^fig-none]]`);
    const dom = editor.view.dom;
    expect([...dom.querySelectorAll("p.caption")].map((el) => el.getAttribute("data-caption"))).toEqual(["그림 1.", "표 1.", "그림 2."]);
    const refs = [...dom.querySelectorAll(".wikilink.xref")] as HTMLElement[];
    expect(refs.map((el) => el.style.getPropertyValue("--xref"))).toEqual(['"표 1"', '"그림 2"', '"그림 1"', '"그림 ?"']);
    expect(refs.at(-1)?.classList.contains("xref-missing")).toBe(true);
    expect(dom.querySelectorAll(".block-id")).toHaveLength(4);
  });

  it("그림 순서를 바꾸면 번호와 참조가 따라간다", () => {
    mount("[[#^fig-b]]\n\n둘째 ^fig-b\n\n첫째 ^fig-a");
    expect(labelName(collectLabels(editor.state.doc).get("fig-b")!)).toBe("그림 1");
    expect((editor.view.dom.querySelector(".xref") as HTMLElement).style.getPropertyValue("--xref")).toBe('"그림 1"');
  });

  it("슬래시 명령처럼 빈 줄의 글자를 지우고 부르면 그 줄이 캡션이 된다", () => {
    mount("위 문단\n\n/그림 번호\n\n아래");
    const start = 1 + "위 문단".length + 2;
    // 슬래시 명령처럼 커서가 지운 자리(빈 줄)에 있다.
    editor.commands.setTextSelection(start + "/그림 번호".length);
    editor.chain().focus().deleteRange({ from: start, to: start + "/그림 번호".length }).insertCaption("fig").run();
    editor.commands.insertContent("새 그림");
    expect(editor.getMarkdown().trimEnd()).toBe("위 문단\n\n새 그림 ^fig-1\n\n아래");
  });

  it("캡션 넣기는 빈 줄이면 그 줄을, 아니면 아래에 다음 번호 캡션을 만든다", () => {
    mount("그림 문단\n\n기존 ^fig-1");
    editor.commands.setTextSelection(2);
    editor.commands.insertCaption("fig");
    editor.commands.insertContent("새 캡션");
    expect(editor.getMarkdown().trimEnd()).toBe("그림 문단\n\n새 캡션 ^fig-2\n\n기존 ^fig-1");
  });
});
