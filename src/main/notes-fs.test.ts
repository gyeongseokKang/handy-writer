import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNote, listNotes, readNote, renameNote, resolveInside, sanitizeNoteName, writeNote } from "./notes-fs";

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
