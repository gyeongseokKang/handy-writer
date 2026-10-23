import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoTimer } from "./auto-timer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("AutoTimer", () => {
  it("분 단위 간격으로 tick을 부르고, 0분이면 아무것도 하지 않는다", async () => {
    const tick = vi.fn(async () => {});
    const timer = new AutoTimer(tick);

    timer.start(0);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(tick).not.toHaveBeenCalled();
    expect(timer.active).toBe(false);

    timer.start(5);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(tick).toHaveBeenCalledTimes(3);
    timer.stop();
  });

  it("이전 tick이 끝나기 전의 간격은 건너뛴다", async () => {
    let release: () => void = () => {};
    const tick = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const timer = new AutoTimer(tick);
    timer.start(1);

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(tick).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    timer.stop();
  });

  it("다시 start하면 이전 타이머를 대체하고 stop하면 멈춘다", async () => {
    const tick = vi.fn(async () => {});
    const timer = new AutoTimer(tick);
    timer.start(1);
    timer.start(10);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(tick).not.toHaveBeenCalled();

    timer.stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(tick).not.toHaveBeenCalled();
  });
});
