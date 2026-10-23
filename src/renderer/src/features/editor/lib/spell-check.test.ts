// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createExtensions } from "./create-extensions";
import type { OnlineSpellResult } from "@shared/online-spell";

import { clearOnlineSpellCache, SPELL_REFRESH, type SpellCheckOptions, type SpellTarget } from "./spell-check";

let editor: Editor;

function mount(markdown: string, overrides: Partial<SpellCheckOptions> = {}) {
  const spell: SpellCheckOptions = {
    isEnabled: () => true,
    isIgnored: () => false,
    onCount: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions({ getNoteNames: () => [], onNavigate: () => {}, isResolved: () => true, onTagClick: () => {}, renderEmbeds: false, spell }),
    content: markdown,
    contentType: "markdown",
  });
  return spell;
}

const underlined = () => [...editor.view.dom.querySelectorAll(".spell-error")].map((el) => el.textContent);

/** 문서에서 문자열을 찾아 커서를 그 안(또는 끝)에 둔다. */
function placeCursorIn(text: string, offset = 1) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at === -1 && node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text) + offset;
  });
  if (at === -1) throw new Error(`못 찾았어요: ${text}`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
}

afterEach(() => {
  editor?.destroy();
  clearOnlineSpellCache();
});

describe("맞춤법 밑줄", () => {
  it("틀린 낱말에 밑줄을 긋고 개수를 알린다 (글 내용은 바뀌지 않는다)", () => {
    const spell = mount("어제 됬다고 했다. 웬지 슬프다.\n\n끝");
    editor.commands.focus("end");
    expect(underlined()).toEqual(["됬다고", "웬지"]);
    expect(spell.onCount).toHaveBeenLastCalledWith(2);
    expect(editor.getMarkdown()).toBe("어제 됬다고 했다. 웬지 슬프다.\n\n끝");
  });

  it("지금 쓰는 낱말(커서가 안이나 끝에 있는 낱말)은 커서가 벗어난 뒤에 표시한다", () => {
    mount("웬지 그리고 됬다\n\n끝");
    editor.commands.focus("end");
    expect(underlined()).toEqual(["웬지", "됬다"]);

    placeCursorIn("웬지", 1);
    expect(underlined()).toEqual(["됬다"]);
    placeCursorIn("웬지", 2); // 낱말 끝
    expect(underlined()).toEqual(["됬다"]);
    placeCursorIn("그리고", 1);
    expect(underlined()).toEqual(["웬지", "됬다"]);
  });

  it("끄면 밑줄이 없고, 켜고 새로고침 신호를 보내면 다시 생긴다", () => {
    let enabled = false;
    mount("웬지\n\n끝", { isEnabled: () => enabled });
    editor.commands.focus("end");
    expect(underlined()).toEqual([]);

    enabled = true;
    editor.view.dispatch(editor.state.tr.setMeta(SPELL_REFRESH, true));
    expect(underlined()).toEqual(["웬지"]);
  });

  it("무시한 낱말은 표시하지 않는다", () => {
    mount("웬지 그리고 됬다\n\n끝", { isIgnored: (key) => key === "wenji:웬지" });
    editor.commands.focus("end");
    expect(underlined()).toEqual(["됬다"]);
  });

  it("코드, 코드 블록, 위키링크, #태그, 주소 안은 검사하지 않는다", () => {
    mount("`웬지` 와 [[웬지]] 와 #웬지 와 https://a.com/웬지\n\n```\n웬지\n```\n\n끝");
    editor.commands.focus("end");
    expect(underlined()).toEqual([]);
  });

  it("굵은 글씨처럼 서식이 섞인 낱말도 한 낱말로 표시하고, 입력하면 바로 반영된다", () => {
    mount("**웬**지 슬퍼\n\n끝");
    editor.commands.focus("end");
    expect(underlined().join("")).toBe("웬지");

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "그냥 됬다 ");
    expect(underlined()).toContain("됬다");
  });

  it("밑줄을 누르면 고칠 낱말과 위치를 알려준다", () => {
    const onSelect = vi.fn<(target: SpellTarget) => void>();
    mount("앞 웬지 뒤\n\n끝", { onSelect });
    editor.commands.focus("end");
    vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({ left: 10, right: 20, top: 20, bottom: 30 });

    const span = editor.view.dom.querySelector(".spell-error")!;
    const pos = editor.view.posAtDOM(span, 0) + 1;
    const handled = editor.view.someProp("handleClick", (handler) => handler(editor.view, pos, { target: span } as unknown as MouseEvent));

    expect(handled).toBeFalsy(); // 클릭이 막히지 않아 커서는 그대로 움직인다
    expect(onSelect).toHaveBeenCalledOnce();
    const target = onSelect.mock.calls[0]![0];
    expect(target.issue).toMatchObject({ text: "웬지", replacement: "왠지" });
    expect(editor.state.doc.textBetween(target.from, target.to)).toBe("웬지");
    expect(target.rect).toEqual({ left: 10, top: 20, bottom: 30 });
  });

  it("밑줄이 아닌 곳을 누르면 아무 일도 없다", () => {
    const onSelect = vi.fn();
    mount("정상 문장\n\n끝", { onSelect });
    const p = editor.view.dom.querySelector("p")!;
    editor.view.someProp("handleClick", (handler) => handler(editor.view, 2, { target: p } as unknown as MouseEvent));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("온라인 검사 합치기", () => {
  const spaceTypo = { token: "모래속에", suggestions: ["모래 속에", "모래속에서"], type: "space", info: "띄어쓰기 오류입니다." };
  const online = (result: OnlineSpellResult) => vi.fn(async (_text: string) => result);
  const waitFor = async (condition: () => boolean, ms = 1000) => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    if (!condition()) throw new Error("조건이 충족되지 않았어요");
  };

  it("온라인 결과가 오면 규칙 기반 밑줄과 함께 표시하고 제안 목록을 갖는다", async () => {
    const checkOnline = online({ status: "ok", typos: [spaceTypo] });
    const onOnlineStatus = vi.fn();
    const onSelect = vi.fn<(t: SpellTarget) => void>();
    mount("웬지 슬프다. 나는 모래속에 두 손을 넣고\n\n끝", { checkOnline, isOnlineEnabled: () => true, onOnlineStatus, onlineDelayMs: 10, onSelect });
    editor.commands.focus("end");
    expect(underlined()).toEqual(["웬지"]); // 규칙 기반은 바로

    await waitFor(() => underlined().length === 2);
    expect(underlined()).toEqual(["웬지", "모래속에"]);
    expect(onOnlineStatus).toHaveBeenCalledWith("ok");

    vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({ left: 0, right: 5, top: 0, bottom: 10 });
    const span = [...editor.view.dom.querySelectorAll(".spell-error")][1]!;
    editor.view.someProp("handleClick", (h) => h(editor.view, editor.view.posAtDOM(span, 0) + 1, { target: span } as unknown as MouseEvent));
    expect(onSelect.mock.calls[0]![0].issue).toMatchObject({ source: "online", replacement: "모래 속에", suggestions: ["모래 속에", "모래속에서"] });
  });

  it("보내는 글에서 코드, 주소, #태그는 가리고, 같은 글은 한 번만 보낸다", async () => {
    const checkOnline = online({ status: "ok", typos: [] });
    mount("`비밀코드` 와 #비밀태그 그리고 https://secret.example 평범한 문장입니다\n\n다른 문단입니다 충분히 깁니다", { checkOnline, isOnlineEnabled: () => true, onlineDelayMs: 10 });
    editor.commands.focus("end");
    await waitFor(() => checkOnline.mock.calls.length === 2);

    const sent = checkOnline.mock.calls.map((c) => c[0]).join("|");
    expect(sent).not.toMatch(/비밀코드|비밀태그|secret/);
    expect(sent).toContain("평범한 문장입니다");

    // 다른 문단만 고치면 바뀌지 않은 문단은 다시 보내지 않는다.
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " 덧붙임입니다");
    await waitFor(() => checkOnline.mock.calls.length === 3);
    await new Promise((r) => setTimeout(r, 60));
    expect(checkOnline.mock.calls.length).toBe(3);
  });

  it("오프라인이면 규칙 기반만 쓰고, 한동안 다시 보내지 않는다", async () => {
    const checkOnline = online({ status: "offline", typos: [] });
    const onOnlineStatus = vi.fn();
    mount("웬지 슬프다. 나는 모래속에 두 손을 넣고\n\n끝", { checkOnline, isOnlineEnabled: () => true, onOnlineStatus, onlineDelayMs: 10 });
    editor.commands.focus("end");
    await waitFor(() => onOnlineStatus.mock.calls.length > 0);

    expect(onOnlineStatus).toHaveBeenCalledWith("offline");
    expect(underlined()).toEqual(["웬지"]);
    const calls = checkOnline.mock.calls.length;

    editor.commands.insertContentAt(editor.state.doc.content.size - 1, " 새로운 문장을 쓰는 중입니다");
    placeCursorIn("끝", 0);
    await new Promise((r) => setTimeout(r, 80));
    expect(checkOnline.mock.calls.length).toBe(calls);
  });

  it("온라인 검사를 끄면 서버로 보내지 않는다", async () => {
    const checkOnline = online({ status: "ok", typos: [spaceTypo] });
    mount("나는 모래속에 두 손을 넣고\n\n끝", { checkOnline, isOnlineEnabled: () => false, onlineDelayMs: 10 });
    editor.commands.focus("end");
    await new Promise((r) => setTimeout(r, 80));
    expect(checkOnline).not.toHaveBeenCalled();
    expect(underlined()).toEqual([]);
  });

  it("서버가 던지면 오프라인으로 보고 밑줄에는 영향이 없다", async () => {
    const checkOnline = vi.fn(async () => Promise.reject(new Error("boom")));
    const onOnlineStatus = vi.fn();
    mount("웬지 슬프다. 문장입니다\n\n끝", { checkOnline, isOnlineEnabled: () => true, onOnlineStatus, onlineDelayMs: 10 });
    editor.commands.focus("end");
    await waitFor(() => onOnlineStatus.mock.calls.length > 0);
    expect(onOnlineStatus).toHaveBeenCalledWith("offline");
    expect(underlined()).toEqual(["웬지"]);
  });
});
