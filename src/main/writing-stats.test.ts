import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WritingStatsStore } from "./writing-stats";

describe("WritingStatsStore", () => {
  it("글마다 하루 시작보다 늘어난 만큼만 세고, 자주 저장해도 두 번 세지 않는다", async () => {
    let now = new Date(2026, 9, 30, 23, 0);
    const file = join(await mkdtemp(join(tmpdir(), "stats-")), "stats.json");
    const store = new WritingStatsStore(file, () => now);

    expect(await store.record("/r", "a.md", "---\ngoal: 10\n---\n12345", "---\ngoal: 10\n---\n1234567")).toBe(2);
    expect(await store.record("/r", "a.md", "1234567", "123456789")).toBe(4);
    expect(await store.record("/r", "b.md", null, "abc")).toBe(7);
    // 줄인 글은 0으로 친다.
    expect(await store.record("/r", "b.md", "abc", "")).toBe(4);
    expect(await store.record("/other", "a.md", null, "x")).toBe(1);
    // 가져온 글처럼 세지 않는 저장은 그만큼 하루 시작 분량을 옮긴다.
    expect(await store.record("/other", "imported.md", "", "가져온 긴 글", false)).toBe(1);
    expect(await store.record("/other", "imported.md", "가져온 긴 글", "가져온 긴 글!!", true)).toBe(3);

    now = new Date(2026, 9, 31, 9, 0);
    expect(await store.record("/r", "a.md", "123456789", "1234567890")).toBe(1);
    expect(await store.get("/r")).toEqual({ today: "2026-10-31", days: { "2026-10-30": 4, "2026-10-31": 1 } });

    await store.flush();
    const reloaded = new WritingStatsStore(file, () => now);
    expect((await reloaded.get("/r")).days).toEqual({ "2026-10-30": 4, "2026-10-31": 1 });
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1);
  });

  it("기록 파일이 깨져 있으면(쓰다가 앱이 꺼짐) 빈 기록으로 덮어쓰지 않고 백업에서 되살리며, 깨진 파일도 남긴다", async () => {
    const now = new Date(2026, 10, 5, 10, 0);
    const dir = await mkdtemp(join(tmpdir(), "stats-"));
    const file = join(dir, "stats.json");
    const first = new WritingStatsStore(file, () => now);
    await first.record("/r", "a.md", null, "12345");
    await first.flush();
    // 다음 실행: 잘 읽히면 백업을 남긴다.
    const second = new WritingStatsStore(file, () => now);
    expect((await second.get("/r")).days["2026-11-05"]).toBe(5);
    await second.record("/r", "a.md", "12345", "1234567");
    // 앱이 꺼지며 반쯤 쓴 파일
    await writeFile(file, '{"version":1,"roots":{"/r":{"da');
    const third = new WritingStatsStore(file, () => now);
    expect((await third.get("/r")).days["2026-11-05"]).toBe(5);
    expect((await readdir(dir)).some((name) => name.startsWith("stats.json.broken-"))).toBe(true);
  });

  it("임시 파일에 다 쓴 뒤 바꿔 끼우고, 앱이 꺼질 때는 그 자리에서 끝까지 쓴다", async () => {
    const now = new Date(2026, 10, 5, 10, 0);
    const dir = await mkdtemp(join(tmpdir(), "stats-"));
    const file = join(dir, "stats.json");
    const store = new WritingStatsStore(file, () => now);
    await store.record("/r", "a.md", null, "abc");
    store.flushSync();
    expect(JSON.parse(await readFile(file, "utf8")).roots["/r"].today.files["a.md"].now).toBe(3);
    expect(await readdir(dir)).not.toContain("stats.json.tmp");
  });
});

