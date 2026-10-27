import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFolder, createNote, duplicateNote, listFolders, listNotes, moveNote, readNote, renameFolder, renameNote, resolveInside, sanitizeNoteName, writeNote } from "./notes-fs";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "handy-writer-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveInside", () => {
  it("작업 폴더 밖으로 나가는 경로를 거부한다", () => {
    expect(() => resolveInside(root, "../밖.md")).toThrow();
    expect(() => resolveInside(root, "a/../../밖.md")).toThrow();
    expect(() => resolveInside(root, "/etc/passwd")).toThrow();
  });

  it("폴더 안의 경로는 허용한다", () => {
    expect(resolveInside(root, "a/b.md")).toBe(join(root, "a", "b.md"));
  });
});

describe("listNotes", () => {
  it("하위 폴더의 .md만 모으고 숨김 폴더와 다른 확장자는 건너뛴다", async () => {
    await mkdir(join(root, "일기"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "a.md"), "A");
    await writeFile(join(root, "일기", "b.md"), "B");
    await writeFile(join(root, ".git", "c.md"), "C");
    await writeFile(join(root, "image.png"), "x");

    const notes = await listNotes(root);

    expect(notes.map((n) => n.path).sort()).toEqual(["a.md", "일기/b.md"]);
    expect(notes.find((n) => n.path === "일기/b.md")).toMatchObject({ name: "b", folder: "일기" });
  });
});

describe("writeNote / readNote", () => {
  it("폴더를 만들어서 쓰고, 임시 파일을 남기지 않는다", async () => {
    await writeNote(root, "새/글.md", "안녕");
    expect(await readNote(root, "새/글.md")).toBe("안녕");
    expect((await listNotes(root)).map((n) => n.path)).toEqual(["새/글.md"]);
  });

  it(".md가 아닌 파일은 거부한다", async () => {
    await expect(writeNote(root, "x.txt", "no")).rejects.toThrow();
    await expect(readNote(root, "x.png")).rejects.toThrow();
  });
});

describe("createNote", () => {
  it("이름이 겹치면 번호를 붙인다", async () => {
    const first = await createNote(root, "");
    const second = await createNote(root, "");
    expect([first.name, second.name]).toEqual(["제목 없음", "제목 없음 1"]);
  });
});

describe("createNote with title", () => {
  it("지정한 제목으로 만들고, 겹치면 번호를 붙인다", async () => {
    const a = await createNote(root, "폴더", "아이디어: 메모");
    const b = await createNote(root, "폴더", "아이디어: 메모");
    expect([a.path, b.path]).toEqual(["폴더/아이디어 메모.md", "폴더/아이디어 메모 1.md"]);
  });
});

describe("renameNote", () => {
  it("파일 이름을 바꾼다", async () => {
    await writeNote(root, "a.md", "내용");
    const meta = await renameNote(root, "a.md", "새 이름");
    expect(meta.path).toBe("새 이름.md");
    expect(await readFile(join(root, "새 이름.md"), "utf8")).toBe("내용");
  });

  it("이미 있는 이름이면 실패하고 원본을 지키며, 빈 이름도 거부한다", async () => {
    await writeNote(root, "a.md", "A");
    await writeNote(root, "b.md", "B");
    await expect(renameNote(root, "a.md", "b")).rejects.toThrow("이미");
    await expect(renameNote(root, "a.md", "  ")).rejects.toThrow();
    expect(await readNote(root, "a.md")).toBe("A");
    expect(await readNote(root, "b.md")).toBe("B");
  });
});

describe("sanitizeNoteName", () => {
  it("파일 이름에 쓸 수 없는 문자를 정리한다", () => {
    expect(sanitizeNoteName(' a/b:c*?"d ')).toBe("a b c d");
  });
});

describe("폴더 다루기", () => {
  it("빈 폴더까지 모으고, 숨김 폴더와 맨 위 attachments 폴더는 뺀다", async () => {
    await mkdir(join(root, "글쓰기", "빈 폴더"), { recursive: true });
    await mkdir(join(root, ".git"));
    await mkdir(join(root, "attachments"));
    await mkdir(join(root, "일기", "attachments"), { recursive: true });
    expect(await listFolders(root)).toEqual(["글쓰기", "글쓰기/빈 폴더", "일기", "일기/attachments"]);
  });

  it("새 폴더는 이름이 겹치면 번호를 붙이고, 숨김 이름은 거부한다", async () => {
    expect(await createFolder(root, "")).toBe("새 폴더");
    expect(await createFolder(root, "")).toBe("새 폴더 1");
    expect(await createFolder(root, "새 폴더", "하위")).toBe("새 폴더/하위");
    await expect(createFolder(root, "", ".숨김")).rejects.toThrow("숨김");
    await expect(createFolder(root, "../밖")).rejects.toThrow();
  });

  it("폴더 이름을 바꾸면 안의 글도 함께 옮겨지고, 같은 이름이 있으면 거부한다", async () => {
    await writeNote(root, "옛 이름/글.md", "본문");
    await mkdir(join(root, "있는 폴더"));
    expect(await renameFolder(root, "옛 이름", "새 이름")).toBe("새 이름");
    expect(await readNote(root, "새 이름/글.md")).toBe("본문");
    await expect(renameFolder(root, "새 이름", "있는 폴더")).rejects.toThrow("이미 있어요");
    await expect(renameFolder(root, "", "x")).rejects.toThrow();
  });
});

describe("글 옮기기와 복제", () => {
  it("다른 폴더로 옮기고, 맨 위로도 옮긴다. 같은 이름이 있으면 거부한다", async () => {
    await writeNote(root, "a/글.md", "본문");
    expect((await moveNote(root, "a/글.md", "b/c")).path).toBe("b/c/글.md");
    expect((await moveNote(root, "b/c/글.md", "")).path).toBe("글.md");
    await writeNote(root, "a/글.md", "다른 글");
    await expect(moveNote(root, "a/글.md", "")).rejects.toThrow("이미 있어요");
    expect(await readNote(root, "글.md")).toBe("본문");
  });

  it("같은 폴더에 번호를 붙인 사본을 만든다", async () => {
    await writeNote(root, "a/글.md", "본문");
    expect((await duplicateNote(root, "a/글.md")).path).toBe("a/글 1.md");
    expect((await duplicateNote(root, "a/글.md")).path).toBe("a/글 2.md");
    expect(await readNote(root, "a/글 2.md")).toBe("본문");
  });
});
