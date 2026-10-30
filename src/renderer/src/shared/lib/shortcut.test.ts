import { describe, expect, it } from "vitest";

import { matchesCommand, shortcutLabel } from "./shortcut";

describe("shortcutLabel", () => {
  it("맥은 기호로, 그 밖은 Ctrl로 보여 준다", () => {
    expect(shortcutLabel("Mod+Shift+H", true)).toBe("⌘⇧H");
    expect(shortcutLabel("Mod+Shift+H", false)).toBe("Ctrl+Shift+H");
    expect(shortcutLabel("Ctrl+Tab", false)).toBe("Ctrl+Tab");
  });
});

describe("matchesCommand", () => {
  it("띄어쓰기와 대소문자를 무시하고 낱말마다 찾는다", () => {
    expect(matchesCommand("변경 기록", "변경 기록 보기")).toBe(true);
    expect(matchesCommand("변경기록", "변경 기록 보기")).toBe(true);
    expect(matchesCommand("pdf 내보", "PDF로 내보내기")).toBe(true);
    expect(matchesCommand("git", "Git 화면 열기", "커밋")).toBe(true);
    expect(matchesCommand("없는말", "변경 기록 보기")).toBe(false);
  });
});
