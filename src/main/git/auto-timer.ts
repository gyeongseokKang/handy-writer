/** 일정 간격으로 `tick`을 부른다. 이전 실행이 끝나지 않았으면 그 간격은 건너뛴다. */
export class AutoTimer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly tick: () => Promise<void>) {}

  start(minutes: number) {
    this.stop();
    if (minutes <= 0) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.tick().finally(() => {
        this.running = false;
      });
    }, minutes * 60_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get active() {
    return this.timer !== null;
  }
}
