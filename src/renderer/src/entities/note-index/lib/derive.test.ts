import type { NoteIndexEntry } from "@shared/types";
import { describe, expect, it } from "vitest";

import { backlinksOf, buildLinkGraph, collectTags, outgoingOf } from "./derive";

const entry = (name: string, links: string[] = [], tags: string[] = [], folder = ""): NoteIndexEntry => ({
  path: `${folder ? `${folder}/` : ""}${name}.md`,
  name,
  links,
  tags,
});

const entries = [
  entry("A", ["B", "C", "없는 글", "A"], ["x"]),
  entry("B", ["A", "c"], ["X", "y"]),
  entry("C"),
  entry("D", ["없는 글"]),
];

describe("buildLinkGraph", () => {
  const graph = buildLinkGraph(entries);

  it("있는 글과 아직 없는 글을 모두 노드로 만들고, 없는 글은 하나로 합친다", () => {
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["A.md", "B.md", "C.md", "D.md", "ghost:없는 글"]);
    expect(graph.nodes.find((n) => n.id === "ghost:없는 글")).toMatchObject({ path: null, name: "없는 글" });
  });

  it("자기 링크와 같은 쪽으로 가는 중복 링크는 만들지 않는다", () => {
    expect(graph.links).toContainEqual({ source: "A.md", target: "B.md" });
    expect(graph.links).toContainEqual({ source: "B.md", target: "A.md" });
    expect(graph.links.filter((l) => l.source === "B.md" && l.target === "C.md")).toHaveLength(1);
    expect(graph.links.some((l) => l.source === l.target)).toBe(false);
  });

  it("degree는 서로 다른 이웃의 수다 (양방향 링크도 1로 센다)", () => {
    const degree = (id: string) => graph.nodes.find((n) => n.id === id)?.degree;
    expect(degree("A.md")).toBe(3); // B, C, 없는 글
    expect(degree("B.md")).toBe(2); // A, C
    expect(degree("ghost:없는 글")).toBe(2);
  });
});

describe("backlinksOf / outgoingOf", () => {
  it("대소문자를 무시하고 링크를 해석해서 백링크를 찾는다", () => {
    expect(backlinksOf(entries, "C.md").map((e) => e.name).sort()).toEqual(["A", "B"]);
    expect(backlinksOf(entries, "D.md")).toEqual([]);
  });

  it("나가는 링크는 있는 글과 없는 글을 구분하고 자기 링크는 뺀다", () => {
    const a = entries[0] as NoteIndexEntry;
    expect(outgoingOf(entries, a)).toEqual([
      { target: "B", path: "B.md" },
      { target: "C", path: "C.md" },
      { target: "없는 글", path: null },
    ]);
  });

  it("같은 이름의 글이 여러 폴더에 있어도 경로로 구분한다", () => {
    const list = [entry("오늘", [], [], "일기"), entry("오늘", [], [], "보관"), entry("링크", ["보관/오늘"])];
    expect(backlinksOf(list, "보관/오늘.md").map((e) => e.name)).toEqual(["링크"]);
    expect(backlinksOf(list, "일기/오늘.md")).toEqual([]);
  });
});

describe("collectTags", () => {
  it("대소문자를 합치고 글이 많은 태그를 앞에 둔다", () => {
    expect(collectTags(entries)).toEqual([
      { tag: "x", paths: ["A.md", "B.md"] },
      { tag: "y", paths: ["B.md"] },
    ]);
  });
});
