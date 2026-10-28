import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { projectSection, scanProject } from "./project-context";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "hw-project-"));
  const files: Record<string, string> = {
    "README.md": "# 내 앱\n할 일 관리 앱이에요.",
    "package.json": '{ "name": "my-app" }',
    ".env": "SECRET_KEY=abc",
    "src/index.ts": "export const a = 1;",
    "src/ui/button.tsx": "export {}",
    "node_modules/lib/index.js": "x",
    ".git/HEAD": "ref",
    "docs/guide.md": "안내",
  };
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(root, rel, ".."), { recursive: true });
    await writeFile(join(root, rel), content);
  }
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe("scanProject", () => {
  it("숨김 폴더와 node_modules를 빼고 파일 목록을 만들고, README와 설정 파일을 읽는다", async () => {
    const scan = await scanProject(root);
    expect(scan.tree).toContain("src/");
    expect(scan.tree).toContain("src/ui/button.tsx");
    expect(scan.tree.some((entry) => entry.includes("node_modules") || entry.includes(".git") || entry.includes(".env"))).toBe(false);
    expect(scan.fileCount).toBe(5);
    expect(scan.files.map((file) => file.path)).toEqual(["README.md", "package.json"]);
  });

  it("<project> 자료에 목록과 파일 내용을 넣고, 비밀 값은 넣지 않는다", async () => {
    const section = projectSection(root, await scanProject(root));
    expect(section).toContain(`path="${root}"`);
    expect(section).toContain('<file path="README.md">\n# 내 앱');
    expect(section).not.toContain("SECRET_KEY");
  });

  it("폴더가 없으면 실패한다", async () => {
    await expect(scanProject(join(root, "없는 폴더"))).rejects.toThrow("프로젝트 폴더를 찾지 못했어요.");
  });
});
