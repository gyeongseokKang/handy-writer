import { describe, expect, it } from "vitest";

import { explainGitError, parseStatusV2, relativizeChanges } from "./parse";

const z = (...tokens: string[]) => tokens.join("\0") + "\0";

describe("parseStatusV2", () => {
  it("브랜치, 업스트림, 앞서고 뒤처진 개수를 읽는다", () => {
    const out = z("# branch.oid abc", "# branch.head main", "# branch.upstream origin/main", "# branch.ab +2 -1");
    expect(parseStatusV2(out)).toMatchObject({ branch: "main", upstream: "origin/main", ahead: 2, behind: 1, changes: [] });
  });

  it("커밋 전 저장소와 분리된 HEAD를 다룬다", () => {
    expect(parseStatusV2(z("# branch.oid (initial)", "# branch.head main")).upstream).toBeNull();
    expect(parseStatusV2(z("# branch.head (detached)")).branch).toBeNull();
  });

  it("한글과 공백이 있는 경로를 따옴표 없이 그대로 읽는다", () => {
    const out = z(
      "1 .M N... 100644 100644 100644 aaa bbb 일기/오늘 쓴 글.md",
      "1 A. N... 000000 100644 100644 000 bbb 새 글.md",
      "1 .D N... 100644 100644 000000 aaa 000 지운 글.md",
      "? 아직 추적 안 함/글 1.md",
    );
    expect(parseStatusV2(out).changes).toEqual([
      { path: "일기/오늘 쓴 글.md", kind: "modified" },
      { path: "새 글.md", kind: "added" },
      { path: "지운 글.md", kind: "deleted" },
      { path: "아직 추적 안 함/글 1.md", kind: "untracked" },
    ]);
  });

  it("이름 변경은 새 경로만 변경으로 세고 원래 경로 토큰은 건너뛴다", () => {
    const out = z("2 R. N... 100644 100644 100644 aaa bbb R100 새 이름.md", "옛 이름.md", "? 다른.md");
    expect(parseStatusV2(out).changes).toEqual([
      { path: "새 이름.md", kind: "renamed" },
      { path: "다른.md", kind: "untracked" },
    ]);
  });

  it("충돌 파일을 conflicted로 표시한다", () => {
    const out = z("u UU N... 100644 100644 100644 100644 a b c 충돌 글.md");
    expect(parseStatusV2(out).changes).toEqual([{ path: "충돌 글.md", kind: "conflicted" }]);
  });
});

describe("relativizeChanges", () => {
  it("작업 폴더가 저장소의 하위 폴더면 접두사를 떼고 폴더 밖 변경은 버린다", () => {
    const changes = [
      { path: "vault/a.md", kind: "modified" as const },
      { path: "vault/sub/b.md", kind: "untracked" as const },
      { path: "other/c.md", kind: "modified" as const },
    ];
    expect(relativizeChanges(changes, "vault/")).toEqual([
      { path: "a.md", kind: "modified" },
      { path: "sub/b.md", kind: "untracked" },
    ]);
    expect(relativizeChanges(changes, "")).toHaveLength(3);
  });
});

describe("explainGitError", () => {
  it.each([
    ["fatal: Authentication failed for 'https://github.com/x/y.git/'", "인증"],
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", "인증"],
    ["git@github.com: Permission denied (publickey).", "인증"],
    ["Author identity unknown\n*** Please tell me who you are.", "user.email"],
    [" ! [rejected]        main -> main (fetch first)", "먼저 풀"],
    ["error: Your local changes to the following files would be overwritten by merge", "먼저 커밋"],
    ["fatal: unable to access 'https://x/': Could not resolve host: x", "연결하지 못했어요"],
  ])("%s → 안내 문구", (stderr, expected) => {
    expect(explainGitError(stderr)).toContain(expected);
  });

  it("모르는 오류는 원문을 그대로 보여준다", () => {
    expect(explainGitError("fatal: something odd")).toBe("fatal: something odd");
  });
});
