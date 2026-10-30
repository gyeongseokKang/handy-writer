import { describe, expect, it } from "vitest";

import { addFrontmatterTags } from "./frontmatter-tags";
import { parseNote } from "./note-parser";

describe("addFrontmatterTags", () => {
  it("frontmatter가 없으면 tags 목록으로 새로 만든다", () => {
    expect(addFrontmatterTags("", ["운동", "#달리기"])).toBe("---\ntags:\n  - 운동\n  - 달리기\n---\n");
  });

  it("한 줄 목록 모양과 다른 값, 주석을 지킨다", () => {
    const out = addFrontmatterTags("---\ntitle: 글 # 제목\ntags: [운동]\ngoal: 3000\n---\n", ["달리기", "운동"]);
    expect(out).toBe("---\ntitle: 글 # 제목\ntags: [운동, 달리기]\ngoal: 3000\n---\n");
    expect(parseNote(`${out}\n본문`).tags).toEqual(["운동", "달리기"]);
  });

  it("여러 줄 목록에 이어 붙이고 이미 있는 태그는 대소문자를 가리지 않고 건너뛴다", () => {
    expect(addFrontmatterTags("---\ntags:\n  - Run\n---\n", ["run", "새"])).toBe("---\ntags:\n  - Run\n  - 새\n---\n");
  });

  it("tags가 없거나 글자로 적혀 있으면 목록으로 만든다", () => {
    expect(addFrontmatterTags("---\ngoal: 10\n---\n", ["a"])).toBe("---\ngoal: 10\ntags:\n  - a\n---\n");
    expect(parseNote(`${addFrontmatterTags("---\ntags: a b\n---\n", ["c"])}`).tags).toEqual(["a", "b", "c"]);
  });

  it("읽을 수 없는 frontmatter는 건드리지 않고 알린다", () => {
    expect(() => addFrontmatterTags("---\n: : [\n---\n", ["a"])).toThrow();
  });
});
