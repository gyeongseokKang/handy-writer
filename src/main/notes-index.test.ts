import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteIndexer } from "./notes-index";

let root: string;
let indexer: NoteIndexer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "handy-writer-index-"));
  indexer = new NoteIndexer();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const read = (rel: string) => readFile(join(root, rel), "utf8");

describe("NoteIndexer.build", () => {
  it("글마다 링크와 태그를 모은다", async () => {
    await writeFile(join(root, "a.md"), "---\ntags: [x]\n---\n\n[[b]] #y");
    await writeFile(join(root, "b.md"), "끝");
    const entries = await indexer.build(root);
    expect(entries.find((e) => e.name === "a")).toMatchObject({ links: ["b"], tags: ["x", "y"] });
    expect(entries.find((e) => e.name === "b")).toMatchObject({ links: [], tags: [] });
  });

  it("invalidate한 글은 다시 읽고, 지워진 글은 색인에서 빠진다", async () => {
    await writeFile(join(root, "a.md"), "[[b]]");
    await writeFile(join(root, "b.md"), "");
    await indexer.build(root);

    await writeFile(join(root, "a.md"), "[[c]]");
    indexer.invalidate(["a.md"]);
    await rm(join(root, "b.md"));

    const entries = await indexer.build(root);
    expect(entries.map((e) => e.path)).toEqual(["a.md"]);
    expect(entries[0]?.links).toEqual(["c"]);
  });
});

describe("NoteIndexer.renameWithLinks", () => {
  it("이름을 바꾸면 다른 글의 링크가 새 이름으로 바뀌고 섹션과 별칭은 유지된다", async () => {
    await mkdir(join(root, "폴더"));
    await writeFile(join(root, "옛 이름.md"), "본문");
    await writeFile(join(root, "a.md"), "[[옛 이름]] 와 [[옛 이름#절|별칭]] 와 [[다른 글]]");
    await writeFile(join(root, "폴더", "b.md"), "![[옛 이름]]\n\n```\n[[옛 이름]]\n```");

    const result = await indexer.renameWithLinks(root, "옛 이름.md", "새 이름");

    expect(result.meta.path).toBe("새 이름.md");
    expect(result.updatedNotes).toBe(2);
    expect(await read("a.md")).toBe("[[새 이름]] 와 [[새 이름#절|별칭]] 와 [[다른 글]]");
    expect(await read("폴더/b.md")).toBe("![[새 이름]]\n\n```\n[[옛 이름]]\n```");
    expect(await read("새 이름.md")).toBe("본문");
  });

  it("같은 이름의 다른 폴더 글을 가리키는 링크는 건드리지 않는다", async () => {
    await mkdir(join(root, "일기"));
    await mkdir(join(root, "보관"));
    await writeFile(join(root, "일기", "오늘.md"), "");
    await writeFile(join(root, "보관", "오늘.md"), "");
    await writeFile(join(root, "a.md"), "[[일기/오늘]] [[보관/오늘]]");

    await indexer.renameWithLinks(root, "보관/오늘.md", "어제");

    expect(await read("a.md")).toBe("[[일기/오늘]] [[보관/어제]]");
  });

  it("자기 자신을 가리키는 링크도 새 이름으로 고친다", async () => {
    await writeFile(join(root, "나.md"), "[[나]]");
    await indexer.renameWithLinks(root, "나.md", "너");
    expect(await read("너.md")).toBe("[[너]]");
  });

  it("이름이 겹쳐 실패하면 아무 글도 고치지 않는다", async () => {
    await writeFile(join(root, "a.md"), "[[b]]");
    await writeFile(join(root, "b.md"), "");
    await writeFile(join(root, "c.md"), "");
    await expect(indexer.renameWithLinks(root, "b.md", "c")).rejects.toThrow();
    expect(await read("a.md")).toBe("[[b]]");
  });
});
