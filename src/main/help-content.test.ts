import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { HELP_FEATURES, HELP_GROUPS } from "../renderer/src/widgets/app-shell/model/help-content";

const IMAGE_DIR = resolve(__dirname, "../renderer/src/shared/assets/help");

describe("도움말 내용", () => {
  it("기능 id는 겹치지 않고 모두 있는 묶음에 속한다", () => {
    const ids = HELP_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(HELP_GROUPS.map((g) => g.id));
    expect(HELP_FEATURES.every((f) => groups.has(f.group))).toBe(true);
    // 빈 묶음은 없다.
    expect(HELP_GROUPS.every((g) => HELP_FEATURES.some((f) => f.group === g.id))).toBe(true);
  });

  it("기능마다 그림(webp)이 있고, 쓰지 않는 그림은 남아 있지 않다", () => {
    const missing = HELP_FEATURES.filter((f) => !existsSync(resolve(IMAGE_DIR, `${f.image}.webp`))).map((f) => f.image);
    expect(missing).toEqual([]);
    const used = new Set(HELP_FEATURES.map((f) => `${f.image}.webp`));
    const extra = readdirSync(IMAGE_DIR).filter((name) => name.endsWith(".webp") && !used.has(name));
    // README만 쓰는 그림(backlinks처럼 기능이 따로 없는 것)이 아니라면 지운다.
    expect(extra).toEqual([]);
  });

  it("그림 한 장은 200KB를 넘지 않는다 (앱에 함께 묶는 용량)", () => {
    for (const f of HELP_FEATURES) expect(statSync(resolve(IMAGE_DIR, `${f.image}.webp`)).size, f.image).toBeLessThan(200 * 1024);
  });

  it("그림 크기 목록(sizes.json)이 실제 그림과 맞는다", () => {
    const sizes = JSON.parse(readFileSync(resolve(IMAGE_DIR, "sizes.json"), "utf8")) as Record<string, number[]>;
    for (const f of HELP_FEATURES) expect(sizes[f.image], f.image).toBeDefined();
  });

  it("제목과 설명이 비어 있지 않다", () => {
    for (const f of HELP_FEATURES) {
      expect(f.title.trim(), f.id).not.toBe("");
      expect(f.summary.trim().length, f.id).toBeGreaterThan(20);
    }
  });
});
