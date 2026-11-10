import { describe, expect, it } from "vitest";

import { readNoteReviseRules, writeNoteReviseRules } from "./note-revise-rules";

describe("note revise rules", () => {
  it("writes multi-line rules into the frontmatter and reads them back, keeping other properties", () => {
    const fm = "---\ntags: [요즘IT]\n---\n";
    const next = writeNoteReviseRules(fm, "- 반말을 쓰지 않는다\n- 마지막 절은 질문으로 끝낸다\n");
    expect(next).toContain("tags: [요즘IT]");
    expect(readNoteReviseRules(next)).toBe("- 반말을 쓰지 않는다\n- 마지막 절은 질문으로 끝낸다");
  });
  it("removes the property when emptied, and works without frontmatter", () => {
    const withRules = writeNoteReviseRules("", "- 짧게");
    expect(readNoteReviseRules(withRules)).toBe("- 짧게");
    expect(writeNoteReviseRules(withRules, "  ")).toBe("");
    expect(readNoteReviseRules("")).toBe("");
  });
});
