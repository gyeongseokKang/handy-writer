import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_GIT_SETTINGS } from "../../shared/git";
import { formatCommitMessage, GitService } from "./git-service";

// 진짜 git으로 임시 저장소와 bare 원격을 만들어 확인한다.
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: process.env }).trim();

let base: string;
let remote: string;
let a: string;
let b: string;
const service = new GitService();

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: "테스터",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "테스터",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
  });
});

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "handy-writer-git-"));
  remote = join(base, "remote.git");
  a = join(base, "a");
  b = join(base, "b");
  await mkdir(a);
  git(base, "init", "--bare", "-b", "main", remote);
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

/** a를 저장소로 만들고 원격에 첫 커밋을 올린 뒤 b로 클론한다. */
async function setup() {
  await service.init(a);
  await writeFile(join(a, "첫 글.md"), "첫 글\n\n둘째 줄\n");
  await writeFile(join(a, "다른 글.md"), "다른 글\n");
  await service.commit(a, "첫 커밋");
  await service.setRemote(a, remote);
  await service.push(a);
  git(base, "clone", remote, b);
}

describe("formatCommitMessage", () => {
  it("{date}를 날짜와 시각으로 바꾸고 빈 템플릿은 기본값을 쓴다", () => {
    const now = new Date(2026, 9, 23, 14, 5);
    expect(formatCommitMessage("백업 {date}", now)).toBe("백업 2026-10-23 14:05");
    expect(formatCommitMessage("  ", now)).toBe("handy-writer: 2026-10-23 14:05");
  });
});

describe("저장소 만들기와 상태", () => {
  it("git 저장소가 아닌 폴더는 isRepo가 false이고 init하면 main 브랜치가 된다", async () => {
    expect((await service.status(a)).isRepo).toBe(false);
    const status = await service.init(a);
    expect(status).toMatchObject({ isRepo: true, branch: "main", hasRemote: false });
    // init이 만든 .gitignore만 첫 변경으로 보인다.
    expect(status.changes).toEqual([{ path: ".gitignore", kind: "untracked" }]);
  });

  it("한글 이름의 새 글은 untracked, 커밋 후에는 깨끗하고 마지막 커밋이 보인다", async () => {
    await service.init(a);
    await writeFile(join(a, "한글 제목 글.md"), "내용");
    expect((await service.status(a)).changes).toContainEqual({ path: "한글 제목 글.md", kind: "untracked" });

    expect(await service.commit(a, "첫 글 추가")).toMatchObject({ outcome: "committed" });
    const status = await service.status(a);
    expect(status.changes).toEqual([]);
    expect(status.lastCommit?.subject).toBe("첫 글 추가");
  });

  it("변경이 없으면 빈 커밋을 만들지 않는다", async () => {
    await service.init(a);
    await writeFile(join(a, "x.md"), "x");
    await service.commit(a, "하나");
    expect(await service.commit(a, "둘")).toMatchObject({ outcome: "nothing-to-commit" });
    expect(git(a, "rev-list", "--count", "HEAD")).toBe("1");
  });

  it("작업 폴더가 저장소의 하위 폴더여도 그 폴더 안의 변경만, 폴더 기준 경로로 보여준다", async () => {
    await service.init(base);
    const vault = join(base, "vault");
    await mkdir(vault);
    await writeFile(join(vault, "안.md"), "안");
    await writeFile(join(base, "밖.md"), "밖");
    const status = await service.status(vault);
    expect(status.changes).toEqual([{ path: "안.md", kind: "untracked" }]);
  });
});

describe("원격과 푸시", () => {
  it("원격 없이 푸시하면 연결하라는 오류를, 연결 후 첫 푸시는 업스트림을 만든다", async () => {
    await service.init(a);
    await writeFile(join(a, "x.md"), "x");
    await service.commit(a, "c");
    await expect(service.push(a)).rejects.toThrow("원격 저장소");

    await service.setRemote(a, remote);
    expect(await service.push(a)).toMatchObject({ outcome: "pushed" });
    expect(await service.status(a)).toMatchObject({ upstream: "origin/main", ahead: 0, hasRemote: true });
    expect(await service.push(a)).toMatchObject({ outcome: "up-to-date" });
  });

  it("원격에 새 커밋이 있으면 푸시가 거절되고 풀하라고 안내한다", async () => {
    await setup();
    await writeFile(join(b, "다른 글.md"), "b에서 고침\n");
    git(b, "commit", "-am", "b 변경");
    git(b, "push");

    await writeFile(join(a, "첫 글.md"), "a에서 고침\n\n둘째 줄\n");
    await service.commit(a, "a 변경");
    await expect(service.push(a)).rejects.toThrow("먼저 풀");
  });
});

describe("가져오기", () => {
  it("원격에 새 커밋만 있으면 fast-forward로 가져온다", async () => {
    await setup();
    await writeFile(join(b, "새 글.md"), "b의 새 글");
    git(b, "add", "-A");
    git(b, "commit", "-m", "b 새 글");
    git(b, "push");

    expect(await service.pull(a)).toMatchObject({ outcome: "fast-forward" });
    expect(await readFile(join(a, "새 글.md"), "utf8")).toBe("b의 새 글");
    expect(await service.pull(a)).toMatchObject({ outcome: "up-to-date" });
  });

  it("서로 다른 파일을 고쳤으면 자동으로 병합한다", async () => {
    await setup();
    await writeFile(join(b, "다른 글.md"), "b에서 고침\n");
    git(b, "commit", "-am", "b");
    git(b, "push");
    await writeFile(join(a, "첫 글.md"), "a에서 고침\n\n둘째 줄\n");
    await service.commit(a, "a");

    expect(await service.pull(a)).toMatchObject({ outcome: "merged" });
    expect(await readFile(join(a, "다른 글.md"), "utf8")).toBe("b에서 고침\n");
    expect(await readFile(join(a, "첫 글.md"), "utf8")).toBe("a에서 고침\n\n둘째 줄\n");
    expect((await service.status(a)).ahead).toBe(2);
  });

  it("같은 줄을 양쪽에서 고쳐 충돌하면 병합을 되돌려 글에 충돌 표시가 남지 않는다", async () => {
    await setup();
    await writeFile(join(b, "첫 글.md"), "b 버전\n\n둘째 줄\n");
    git(b, "commit", "-am", "b");
    git(b, "push");
    await writeFile(join(a, "첫 글.md"), "a 버전\n\n둘째 줄\n");
    await service.commit(a, "a");
    const headBefore = git(a, "rev-parse", "HEAD");

    const result = await service.pull(a);

    expect(result.outcome).toBe("conflict");
    expect(result.conflictFiles).toEqual(["첫 글.md"]);
    expect(await readFile(join(a, "첫 글.md"), "utf8")).toBe("a 버전\n\n둘째 줄\n");
    expect(git(a, "rev-parse", "HEAD")).toBe(headBefore);
    const status = await service.status(a);
    expect(status.merging).toBe(false);
    expect(status.changes).toEqual([]);
  });

  it("저장하지 않은 변경이 병합과 겹치면 먼저 커밋하라고 안내한다", async () => {
    await setup();
    await writeFile(join(b, "첫 글.md"), "b 버전\n\n둘째 줄\n");
    git(b, "commit", "-am", "b");
    git(b, "push");
    await writeFile(join(a, "첫 글.md"), "a의 저장 안 한 변경\n\n둘째 줄\n");

    await expect(service.pull(a)).rejects.toThrow("먼저 커밋");
    expect(await readFile(join(a, "첫 글.md"), "utf8")).toBe("a의 저장 안 한 변경\n\n둘째 줄\n");
  });
});

describe("동기화", () => {
  it("커밋, 가져오기, 푸시를 한 번에 하고 원격에 내 변경이 올라간다", async () => {
    await setup();
    await writeFile(join(b, "b 글.md"), "b");
    git(b, "add", "-A");
    git(b, "commit", "-m", "b");
    git(b, "push");
    await writeFile(join(a, "a 글.md"), "a");

    const result = await service.sync(a, DEFAULT_GIT_SETTINGS);

    expect(result.outcome).toBe("synced");
    expect(result.message).toContain("커밋");
    expect(result.message).toContain("푸시");
    expect(git(remote, "-c", "core.quotepath=off", "ls-tree", "-r", "--name-only", "main")).toContain("a 글.md");
    expect(await readFile(join(a, "b 글.md"), "utf8")).toBe("b");
    expect(await service.sync(a, DEFAULT_GIT_SETTINGS)).toMatchObject({ message: "이미 모두 최신이에요." });
  });

  it("충돌이 나면 푸시하지 않고 멈춘다", async () => {
    await setup();
    await writeFile(join(b, "첫 글.md"), "b 버전\n\n둘째 줄\n");
    git(b, "commit", "-am", "b");
    git(b, "push");
    await writeFile(join(a, "첫 글.md"), "a 버전\n\n둘째 줄\n");

    expect(await service.sync(a, DEFAULT_GIT_SETTINGS)).toMatchObject({ outcome: "conflict" });
    expect(git(remote, "show", "main:첫 글.md")).toContain("b 버전");
  });
});

describe("글 기록", () => {
  it("git 저장소가 아니면 available이 false다", async () => {
    expect(await service.history(a, "글.md")).toEqual({ available: false, versions: [] });
  });

  it("커밋이 없으면 빈 기록이다", async () => {
    await service.init(a);
    await writeFile(join(a, "글.md"), "하나\n");
    expect(await service.history(a, "글.md")).toEqual({ available: true, versions: [] });
  });

  it("이름을 바꾼 글도 따라가서 버전마다 그때의 내용을 읽는다", async () => {
    await service.init(a);
    await mkdir(join(a, "폴더"));
    await writeFile(join(a, "폴더", "옛 이름.md"), "하나\n");
    await service.commit(a, "처음");
    await writeFile(join(a, "다른 글.md"), "상관없음\n");
    await service.commit(a, "다른 글만");
    git(a, "mv", "폴더/옛 이름.md", "폴더/새 이름.md");
    await writeFile(join(a, "폴더", "새 이름.md"), "하나\n둘\n");
    await service.commit(a, "이름 바꾸고 고침");

    const { available, versions } = await service.history(a, "폴더/새 이름.md");
    expect(available).toBe(true);
    expect(versions.map((v) => v.subject)).toEqual(["이름 바꾸고 고침", "처음"]);
    expect(versions[0]).toMatchObject({ author: "테스터", blobPath: "폴더/새 이름.md" });
    expect(versions[1]?.blobPath).toBe("폴더/옛 이름.md");
    expect(versions[0]!.time).toBeGreaterThan(1_600_000_000_000);
    expect(await service.readVersion(a, versions[1]!.hash, versions[1]!.blobPath)).toBe("하나\n");
    expect(await service.readVersion(a, versions[0]!.hash, versions[0]!.blobPath)).toBe("하나\n둘\n");
  });

  it("작업 폴더가 저장소의 하위 폴더여도 저장소 루트 기준 경로를 돌려준다", async () => {
    await service.init(a);
    await mkdir(join(a, "볼트"));
    await writeFile(join(a, "볼트", "글.md"), "내용\n");
    await service.commit(a, "첫");
    const sub = join(a, "볼트");
    const { versions } = await service.history(sub, "글.md");
    expect(versions[0]?.blobPath).toBe("볼트/글.md");
    expect(await service.readVersion(sub, versions[0]!.hash, versions[0]!.blobPath)).toBe("내용\n");
  });

  it("잘못된 커밋이나 마크다운이 아닌 경로는 거부한다", async () => {
    await expect(service.readVersion(a, "HEAD", "글.md")).rejects.toThrow();
    await expect(service.readVersion(a, "abcdef1", "비밀.txt")).rejects.toThrow();
  });
});
