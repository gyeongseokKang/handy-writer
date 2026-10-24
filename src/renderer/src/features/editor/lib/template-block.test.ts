// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { formatTemplateMeta, stripTemplateMetadata, type TemplateBlockMeta } from "@shared/templates";
import { afterEach, describe, expect, it } from "vitest";

import type { TemplateBlockAttrs } from "@/entities/note/model/use-editor-bridge";

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

const meta: TemplateBlockMeta = { id: "more-info", inputs: { topic: "양자 얽힘", depth: "약 400자" }, extra: "", web: true, scope: "section" };
const block = (body: string, m: TemplateBlockMeta = meta, title = "더 알아보기", style = "tip") =>
  `> [!${style}] ${title} ${formatTemplateMeta(m)}\n${body.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n")}`;

const nodeTypes = () => {
  const types: string[] = [];
  editor.state.doc.descendants((n) => {
    types.push(n.type.name);
  });
  return types;
};

function placeCursorIn(text: string, offset = 1) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text) + offset;
  });
  if (at === -1) throw new Error(`못 찾았어요: ${text}`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}

afterEach(() => editor?.destroy());

describe("템플릿 블록 마크다운 왕복", () => {
  it("콜아웃 + 메타데이터 주석으로 저장하고 그대로 되돌린다 (여러 블록 내용 포함)", () => {
    const md = block("첫 문단\n\n- 목록 1\n- 목록 2\n\n둘째 문단");
    mount(md);
    expect(editor.getMarkdown()).toBe(md);
    expect(nodeTypes()).toContain("templateBlock");
    expect(nodeTypes()).not.toContain("callout");
  });

  it("입력값과 속성을 읽는다", () => {
    mount(block("내용"));
    const node = editor.state.doc.firstChild!;
    expect(node.type.name).toBe("templateBlock");
    expect(node.attrs).toMatchObject({ templateId: "more-info", style: "tip", title: "더 알아보기", inputs: { topic: "양자 얽힘", depth: "약 400자" }, web: true, scope: "section" });
    expect(node.attrs["uid"]).toBeTruthy();
  });

  it("주석을 깨뜨릴 수 있는 글자와 줄바꿈이 들어간 입력값도 보존한다", () => {
    const tricky: TemplateBlockMeta = { ...meta, inputs: { topic: "a --> b <c>", memo: "줄\n바꿈 한글" }, extra: "짧게 --" };
    const md = block("내용", tricky);
    mount(md);
    expect(editor.getMarkdown()).toBe(md);
    expect(editor.state.doc.firstChild!.attrs["inputs"]).toEqual(tricky.inputs);
  });

  it("앞뒤 문단과 함께 있어도, 블록이 연달아 있어도 각각 읽고 uid가 서로 다르다", () => {
    const md = `앞 문단\n\n${block("하나")}\n\n${block("둘", { ...meta, id: "tip" }, "Tip", "info")}\n\n뒤 문단`;
    mount(md);
    expect(editor.getMarkdown()).toBe(md);
    const uids: string[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === "templateBlock") uids.push(n.attrs["uid"]);
    });
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
  });

  it("메타데이터가 없는 일반 콜아웃은 템플릿 블록이 아니다", () => {
    const md = "> [!tip] 일반 콜아웃\n> 내용";
    mount(md);
    expect(nodeTypes()).toContain("callout");
    expect(nodeTypes()).not.toContain("templateBlock");
    expect(editor.getMarkdown()).toBe(md);
  });

  it("메타데이터가 깨졌으면 일반 콜아웃으로 읽고 글자는 그대로 보존한다", () => {
    const md = "> [!tip] 제목 <!--hw-template {깨짐}-->\n> 내용";
    mount(md);
    expect(nodeTypes()).toContain("callout");
    expect(editor.getMarkdown()).toBe(md);
  });

  it("export용으로 메타데이터를 떼면 평범한 콜아웃이 되어 내용이 그대로 남는다", () => {
    mount(block("내용 한 줄"));
    const plain = stripTemplateMetadata(editor.getMarkdown());
    expect(plain).toBe("> [!tip] 더 알아보기\n> 내용 한 줄");
    editor.destroy();
    mount(plain);
    expect(nodeTypes()).toContain("callout");
    expect(editor.getMarkdown()).toBe(plain);
  });
});

describe("브리지: 템플릿 맥락", () => {
  const doc = [
    "도입 문단",
    "# 제목1",
    "앞 문단",
    "## 소제목",
    "문단 A",
    "문단 B",
    "### 하위",
    "문단 C",
    "## 다음 소제목",
    "문단 D",
  ].join("\n\n");

  it("현재 문단, 현재 섹션(하위 제목 포함, 같은 높이 제목 전까지), 글 전체를 돌려준다", () => {
    const bridge = mount(doc);
    placeCursorIn("문단 B");
    expect(bridge.getTemplateContext("paragraph")).toBe("문단 B");
    expect(bridge.getTemplateContext("section")).toBe("## 소제목\n\n문단 A\n\n문단 B\n\n### 하위\n\n문단 C");
    expect(bridge.getTemplateContext("note")).toContain("도입 문단");
    expect(bridge.getTemplateContext("note")).toContain("문단 D");
    expect(bridge.getTemplateContext("none")).toBe("");
  });

  it("제목 위에 있는 글은 첫 제목 전까지가 섹션이다", () => {
    const bridge = mount(doc);
    placeCursorIn("도입 문단");
    expect(bridge.getTemplateContext("section")).toBe("도입 문단");
  });

  it("커서가 제목 위에 있으면 그 제목이 섹션의 시작이다", () => {
    const bridge = mount(doc);
    placeCursorIn("다음 소제목");
    expect(bridge.getTemplateContext("section")).toBe("## 다음 소제목\n\n문단 D");
  });

  it("선택한 글 범위는 선택한 글만, 선택이 없으면 현재 문단으로 대신한다", () => {
    const bridge = mount(doc);
    placeCursorIn("문단 A");
    expect(bridge.getTemplateContext("selection")).toBe("문단 A");
    let from = -1;
    editor.state.doc.descendants((n, pos) => {
      if (from === -1 && n.isText && n.text === "문단 C") from = pos;
    });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, from + 2)));
    expect(bridge.getTemplateContext("selection")).toBe("문단");
    expect(bridge.getSelectionText()).toBe("문단");
  });

  it("이미 있는 템플릿 블록은 맥락에서 뺀다", () => {
    const bridge = mount(`# 제목\n\n본문 문단\n\n${block("AI가 쓴 내용")}\n\n뒤 문단`);
    placeCursorIn("본문 문단");
    const context = bridge.getTemplateContext("section");
    expect(context).toContain("본문 문단");
    expect(context).toContain("뒤 문단");
    expect(context).not.toContain("AI가 쓴 내용");
    expect(bridge.getTemplateContext("note")).not.toContain("AI가 쓴 내용");
  });
});

describe("브리지: 템플릿 블록 삽입과 교체", () => {
  const attrs: TemplateBlockAttrs = { templateId: "more-info", style: "tip", title: "더 알아보기", inputs: { topic: "A" }, extra: "", web: false, scope: "section" };

  it("커서가 있는 최상위 블록 바로 아래에 넣고, 목록 안에 있어도 목록 아래에 넣는다", () => {
    const bridge = mount("첫 문단\n\n- 항목 1\n- 항목 2\n\n끝 문단");
    placeCursorIn("항목 1");
    const uid = bridge.insertTemplateBlock(attrs, "새로 만든 내용\n\n- 불릿");
    const md = editor.getMarkdown();
    expect(md.indexOf("- 항목 2")).toBeLessThan(md.indexOf("[!tip]"));
    expect(md.indexOf("[!tip]")).toBeLessThan(md.indexOf("끝 문단"));
    expect(md).toContain("> 새로 만든 내용\n>\n> - 불릿");
    expect(bridge.getTemplateBlock(uid)).toMatchObject({ attrs, markdown: "새로 만든 내용\n\n- 불릿" });
  });

  it("다시 생성하면 같은 자리에서 내용과 입력값만 바뀌고 uid는 그대로다", () => {
    const bridge = mount("앞\n\n뒤");
    placeCursorIn("앞");
    const uid = bridge.insertTemplateBlock(attrs, "처음 내용");
    const before = editor.getMarkdown().indexOf("[!tip]");

    expect(bridge.replaceTemplateBlock(uid, { ...attrs, inputs: { topic: "B" } }, "바뀐 내용")).toBe(true);

    const md = editor.getMarkdown();
    expect(md.indexOf("[!tip]")).toBe(before);
    expect(md).toContain("> 바뀐 내용");
    expect(md).not.toContain("처음 내용");
    expect(bridge.getTemplateBlock(uid)).toMatchObject({ attrs: { inputs: { topic: "B" } }, markdown: "바뀐 내용" });
    expect(md).toMatch(/"inputs":\{"topic":"B"\}/);
  });

  it("없는 uid는 읽지도 바꾸지도 못한다", () => {
    const bridge = mount("글");
    expect(bridge.getTemplateBlock("없음")).toBeNull();
    expect(bridge.replaceTemplateBlock("없음", attrs, "x")).toBe(false);
  });

  it("빈 글에도 넣을 수 있고, 내용이 비어 있어도 빈 문단 하나는 남는다", () => {
    const bridge = mount("");
    const uid = bridge.insertTemplateBlock(attrs, "  ");
    expect(bridge.getTemplateBlock(uid)).not.toBeNull();
    expect(nodeTypes()).toContain("templateBlock");
  });
});
