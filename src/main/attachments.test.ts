import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { importFiles, listAttachments, parseRange, resolveAssetFile, saveAttachment } from "./attachments";

let root: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "handy-writer-att-"));
  outside = await mkdtemp(join(tmpdir(), "handy-writer-src-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe("listAttachments", () => {
  it("하위 폴더의 이미지, 영상, 오디오, PDF만 모으고 숨김 폴더와 다른 파일은 건너뛴다", async () => {
    await mkdir(join(root, "attachments"));
    await mkdir(join(root, ".git"));
    await writeFile(join(root, "attachments", "사진.PNG"), "x");
    await writeFile(join(root, "영상.webm"), "xx");
    await writeFile(join(root, "글.md"), "note");
    await writeFile(join(root, "script.js"), "x");
    await writeFile(join(root, ".git", "숨김.png"), "x");

    const list = await listAttachments(root);

    expect(list.map((a) => [a.path, a.kind, a.size]).sort()).toEqual([
      ["attachments/사진.PNG", "image", 1],
      ["영상.webm", "video", 2],
    ]);
  });
});

describe("importFiles", () => {
  it("attachments/ 로 복사하고, 이름이 겹치면 번호를 붙이고, 원본은 그대로 둔다", async () => {
    const src = join(outside, "여행 사진.jpg");
    await writeFile(src, "원본");

    const first = await importFiles(root, [src]);
    const second = await importFiles(root, [src]);

    expect(first.imported[0]?.path).toBe("attachments/여행 사진.jpg");
    expect(second.imported[0]?.path).toBe("attachments/여행 사진 1.jpg");
    expect(await readFile(join(root, "attachments", "여행 사진 1.jpg"), "utf8")).toBe("원본");
    expect(await readFile(src, "utf8")).toBe("원본");
  });

  it("지원하지 않는 형식과 없는 파일은 건너뛰고 알려준다", async () => {
    const good = join(outside, "a.png");
    const bad = join(outside, "run.exe");
    await writeFile(good, "x");
    await writeFile(bad, "x");

    const result = await importFiles(root, [good, bad, join(outside, "없음.png")]);

    expect(result.imported.map((a) => a.name)).toEqual(["a.png"]);
    expect(result.skipped).toEqual(["run.exe", "없음.png"]);
  });
});

describe("saveAttachment", () => {
  it("내용을 저장하고 확장자는 소문자로, 이름의 위험한 문자는 정리한다", async () => {
    const meta = await saveAttachment(root, "Pasted:image?.PNG", new Uint8Array([1, 2, 3]));
    expect(meta.path).toBe("attachments/Pasted image.png");
    expect((await readFile(join(root, meta.path))).length).toBe(3);
  });

  it("경로 조각이 섞인 이름은 파일 이름만 쓰고, 지원하지 않는 형식은 거부한다", async () => {
    const meta = await saveAttachment(root, "../../밖/탈출.png", new Uint8Array([1]));
    expect(meta.path).toBe("attachments/탈출.png");
    await expect(saveAttachment(root, "run.sh", new Uint8Array([1]))).rejects.toThrow("첨부할 수 있어요");
  });
});

describe("resolveAssetFile", () => {
  it("작업 폴더 안의 첨부 형식만 허용한다", () => {
    expect(resolveAssetFile(root, "attachments/a.png")).toBe(join(root, "attachments", "a.png"));
    expect(() => resolveAssetFile(root, "../밖.png")).toThrow();
    expect(() => resolveAssetFile(root, "attachments/../../밖.png")).toThrow();
    expect(() => resolveAssetFile(root, "글.md")).toThrow();
    expect(() => resolveAssetFile(root, "config.json")).toThrow();
    expect(() => resolveAssetFile(root, ".git/x.png")).toThrow("숨김");
  });
});

describe("parseRange", () => {
  it("헤더가 없으면 null이다", () => {
    expect(parseRange(null, 100)).toBeNull();
  });

  it("시작-끝, 시작-, -마지막N을 읽는다", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("파일 밖이거나 모양이 틀리면 invalid이다", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseRange("bytes=-", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1,5-6", 100)).toBe("invalid");
  });
});
