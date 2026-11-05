import { describe, expect, it } from "vitest";

import { addHistory, MAX_HISTORY, type AiHistoryItem } from "./ai-history";

const item = (id: string, output = `결과 ${id}`): AiHistoryItem => ({ id, task: "continue", output, notePath: "글.md", noteName: "글", instruction: "", at: "2026-11-05T00:00:00Z" });

describe("addHistory", () => {
  it("puts the newest first and skips empty results", () => {
    expect(addHistory([item("a")], item("b")).map((i) => i.id)).toEqual(["b", "a"]);
    expect(addHistory([item("a")], item("c", "  "))).toHaveLength(1);
  });
  it("replaces the same run and keeps at most MAX_HISTORY", () => {
    expect(addHistory([item("a", "옛")], item("a", "새"))).toEqual([item("a", "새")]);
    const many = Array.from({ length: MAX_HISTORY }, (_, i) => item(String(i)));
    const next = addHistory(many, item("new"));
    expect(next).toHaveLength(MAX_HISTORY);
    expect(next[0]!.id).toBe("new");
  });
});
