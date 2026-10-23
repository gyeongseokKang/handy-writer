import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NoteSearcher } from "./notes-search";

let root: string;
let searcher: NoteSearcher;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "handy-writer-search-"));
  searcher = new NoteSearcher();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const names = async (query: string) => (await searcher.search(root, query)).map((r) => r.path);

describe("NoteSearcher", () => {
  it("하위 폴더의 글 본문과 frontmatter 태그를 찾고, 숨김 폴더와 frontmatter 값은 본문으로 보지 않는다", async () => {
    await mkdir(join(root, "일기"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "일기", "오늘.md"), "---\ntags: [회고]\nsecret: 비밀값\n---\n\n오늘은 카페에서 글을 썼다");
    await writeFile(join(root, ".git", "x.md"), "카페 숨김");
    await writeFile(join(root, "다른.md"), "관련 없음");

    expect(await names("카페")).toEqual(["일기/오늘.md"]);
    expect(await names("회고")).toEqual(["일기/오늘.md"]);
    expect(await names("비밀값")).toEqual([]);
  });

  it("파일이 바뀌면(mtime) 다시 읽고, invalidate한 글도 다시 읽는다", async () => {
    const file = join(root, "a.md");
    await writeFile(file, "처음 내용");
    expect(await names("처음")).toEqual(["a.md"]);

    await writeFile(file, "바뀐 내용");
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    expect(await names("처음")).toEqual([]);
    expect(await names("바뀐")).toEqual(["a.md"]);

    await writeFile(file, "또 바뀜");
    searcher.invalidate(["a.md"]);
    expect(await names("또")).toEqual(["a.md"]);
  });

  it("지워진 글은 결과에서 빠진다", async () => {
    await writeFile(join(root, "a.md"), "지울 글");
    expect(await names("지울")).toEqual(["a.md"]);
    await rm(join(root, "a.md"));
    expect(await names("지울")).toEqual([]);
  });
});
