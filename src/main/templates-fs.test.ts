import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILTIN_TEMPLATES, type Template } from "../shared/templates";
import { listTemplates, removeTemplate, saveTemplate, TEMPLATE_DIR } from "./templates-fs";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "handy-writer-tpl-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const draft = (over: Partial<Template> = {}): Template => ({
  id: "",
  name: "새 템플릿",
  description: "",
  style: "info",
  title: "",
  context: "paragraph",
  web: false,
  referencesOnly: false,
  fields: [{ key: "term", label: "용어", type: "text", required: true, placeholder: "", options: [], default: "" }],
  prompt: "{{term}}을 설명하세요.",
  ...over,
});

describe("listTemplates", () => {
  it("파일이 없어도 내장 템플릿이 보인다", async () => {
    const list = await listTemplates(root);
    expect(list.map((t) => t.id).sort()).toEqual(BUILTIN_TEMPLATES.map((t) => t.id).sort());
    expect(list.every((t) => t.builtin && !t.customized)).toBe(true);
  });

  it("사용자 파일을 읽고, 같은 id의 파일은 내장 템플릿을 대신한다", async () => {
    await mkdir(join(root, TEMPLATE_DIR), { recursive: true });
    await writeFile(join(root, TEMPLATE_DIR, "내 템플릿.md"), "---\nname: 내 템플릿\nstyle: warning\n---\n프롬프트");
    await writeFile(join(root, TEMPLATE_DIR, "tip.md"), "---\nname: 나만의 Tip\n---\n내 Tip 프롬프트");
    await writeFile(join(root, TEMPLATE_DIR, "메모.txt"), "무시");

    const list = await listTemplates(root);
    const byId = Object.fromEntries(list.map((t) => [t.id, t]));
    expect(byId["내 템플릿"]).toMatchObject({ name: "내 템플릿", style: "warning" });
    expect(byId["내 템플릿"]?.builtin).toBeUndefined();
    expect(byId["tip"]).toMatchObject({ name: "나만의 Tip", builtin: true, customized: true, prompt: "내 Tip 프롬프트" });
    expect(list.filter((t) => t.id === "tip")).toHaveLength(1);
    expect(list).toHaveLength(BUILTIN_TEMPLATES.length + 1);
  });
});

describe("saveTemplate / removeTemplate", () => {
  it("새 템플릿은 이름으로 파일을 만들고, 이름이 겹치면 번호를 붙인다", async () => {
    const first = await saveTemplate(root, draft());
    const second = await saveTemplate(root, draft());
    expect([first.id, second.id]).toEqual(["새 템플릿", "새 템플릿 1"]);
    expect(await readFile(join(root, TEMPLATE_DIR, "새 템플릿.md"), "utf8")).toContain("{{term}}을 설명하세요.");
    expect((await listTemplates(root)).some((t) => t.id === "새 템플릿 1")).toBe(true);
  });

  it("내장 템플릿과 같은 이름으로 새로 만들면 내장을 덮어쓰지 않고 번호를 붙인다", async () => {
    const saved = await saveTemplate(root, draft({ name: "tip" }));
    expect(saved.id).toBe("tip 1");
  });

  it("id가 있으면 그 파일을 고치고, 내장 템플릿을 고치면 customized로 표시한다", async () => {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === "tip")!;
    const saved = await saveTemplate(root, { ...builtin, prompt: "내가 고친 프롬프트" });
    expect(saved).toMatchObject({ id: "tip", builtin: true, customized: true, prompt: "내가 고친 프롬프트" });
    expect((await listTemplates(root)).find((t) => t.id === "tip")?.prompt).toBe("내가 고친 프롬프트");
  });

  it("지우면 내장 템플릿은 기본값으로 돌아가고 사용자 템플릿은 사라진다", async () => {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === "tip")!;
    await saveTemplate(root, { ...builtin, prompt: "고침" });
    const mine = await saveTemplate(root, draft());

    await removeTemplate(root, "tip");
    await removeTemplate(root, mine.id);
    const list = await listTemplates(root);
    const restored = list.find((t) => t.id === "tip");
    expect(restored).toMatchObject({ prompt: builtin.prompt, builtin: true });
    expect(restored?.customized).toBeUndefined();
    expect(list.some((t) => t.id === mine.id)).toBe(false);
    await expect(removeTemplate(root, "없던 것")).resolves.toBeUndefined();
  });

  it("이름과 프롬프트가 비어 있으면 거부한다", async () => {
    await expect(saveTemplate(root, draft({ name: "  " }))).rejects.toThrow("이름");
    await expect(saveTemplate(root, draft({ prompt: " " }))).rejects.toThrow("프롬프트");
  });

  it("경로 조각이 섞인 id는 거부해서 작업 폴더 밖에 쓰지 못한다", async () => {
    await expect(saveTemplate(root, draft({ id: "../../밖" }))).rejects.toThrow("올바르지 않은");
    await expect(saveTemplate(root, draft({ id: "a/b" }))).rejects.toThrow("올바르지 않은");
    await expect(removeTemplate(root, "../x")).rejects.toThrow("올바르지 않은");
  });
});
