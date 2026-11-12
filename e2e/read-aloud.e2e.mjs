// 소리 내어 읽기: 탭 막대의 버튼을 누르면 한 문장씩 읽고 읽는 문장을 칠한다. 코드 블록은 건너뛰고,
// 잠깐 멈춤·이어 읽기·앞뒤 문장·속도·Esc로 그만 읽기, 선택한 부분만 읽기를 실제 앱에서 확인한다.
// 시험 환경에는 음성이 없어서 speechSynthesis를 가짜로 바꿔 읽은 문장을 기록한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:read-aloud`
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const env = await launchApp({ open: "듣기", files: { "듣기.md": "## 소개\n\n첫 문장이다. 둘째 문장이다!\n\n```\n코드는 읽지 않는다.\n```\n\nThis line is English.\n\n마지막 문단이다.\n" } });
const { page, logs } = env;

await page.evaluate(() => {
  window.__spoken = [];
  const fake = {
    cur: null,
    timer: 0,
    getVoices: () => [],
    cancel() {
      const u = this.cur;
      this.cur = null;
      clearTimeout(this.timer);
      u?.onerror?.({ error: "interrupted" });
    },
    speak(u) {
      window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang });
      this.cur = u;
      this.timer = setTimeout(() => {
        if (this.cur !== u) return;
        this.cur = null;
        u.onend?.({});
      }, 600);
    },
    pause() {},
    resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
});
const spoken = () => page.evaluate(() => window.__spoken.map((s) => s.text));
const highlighted = () => page.evaluate(() => CSS.highlights.has("read-aloud"));

const button = page.getByRole("button", { name: "소리 내어 읽기" });
const bar = page.getByRole("toolbar", { name: "소리 내어 읽기" });
await page.locator(".note-prose h2").first().click();
await page.keyboard.press("Control+Home");
await button.click();
await bar.waitFor({ timeout: 3000 });
assert((await spoken())[0] === "소개" && (await highlighted()), "버튼을 누르면 글 처음부터 읽고 읽는 문장을 칠한다");
assert((await bar.getByLabel("읽는 문장").innerText()).includes("1/5"), "몇 번째 문장인지 보인다 (코드 블록은 빼고 5문장)");
await page.screenshot({ path: path.join(OUT, "read-aloud.png") });

// 잠깐 멈추고 이어 읽기
await sleep(700);
await bar.getByRole("button", { name: "잠깐 멈추기" }).click();
const pausedAt = (await spoken()).length;
await sleep(900);
assert((await spoken()).length === pausedAt && (await bar.getByLabel("읽는 문장").innerText()).includes("멈춤"), "잠깐 멈추면 다음 문장으로 넘어가지 않는다");
await bar.getByRole("button", { name: "이어 읽기" }).click();
assert((await spoken()).at(-1) === (await spoken())[pausedAt - 1], "이어 읽으면 멈춘 문장의 처음부터 다시 읽는다");

// 속도: 실제로 마우스로 눌러 바꾸고, 바꾸면 지금 문장부터 바로 그 속도로 다시 읽는다
const sentBefore = (await spoken()).length;
await bar.getByRole("button", { name: "더 빠르게" }).click();
await bar.getByRole("button", { name: "더 빠르게" }).click();
const last = await page.evaluate(() => window.__spoken.at(-1));
assert((await bar.getByLabel("지금 속도").innerText()) === "1.5×" && last.rate === 1.5 && last.lang === "ko-KR", "더 빠르게를 누르면 속도가 오르고 바로 그 속도로 한국어로 읽는다");
assert((await spoken()).length === sentBefore + 2 && (await spoken()).at(-1) === (await spoken()).at(-3), "속도를 바꾸면 지금 문장을 처음부터 다시 읽는다");
// 유튜브처럼 Shift + < 느리게, Shift + > 빠르게 (에디터에 글자가 들어가지 않는다)
await page.keyboard.press("Shift+Comma");
assert((await bar.getByLabel("지금 속도").innerText()) === "1.2×", "Shift + <로 한 단계 느리게");
await page.keyboard.press("Shift+Period");
assert((await bar.getByLabel("지금 속도").innerText()) === "1.5×" && !(await page.locator(".note-prose").innerText()).includes("<"), "Shift + >로 한 단계 빠르게, 글에는 아무것도 들어가지 않는다");
await bar.getByRole("button", { name: "다음 문장" }).click();

await page.waitForFunction(() => window.__spoken.some((s) => s.text === "마지막 문단이다."), null, { timeout: 5000 });
await sleep(800);
const all = await spoken();
assert(all.includes("첫 문장이다.") && all.includes("둘째 문장이다!") && !all.some((t) => t.includes("코드")), `한 문장씩 읽고 코드 블록은 건너뛴다 (${all.join(" / ")})`);
assert((await page.evaluate(() => window.__spoken.find((s) => s.text === "This line is English.")?.lang)) === "en-US", "한글 없는 영어 문장은 영어로 읽는다");
assert((await bar.count()) === 0 && !(await highlighted()), "끝까지 읽으면 막대와 칠한 표시가 사라진다");

// 선택한 부분만 읽기, Esc로 그만 읽기
const para = page.locator(".note-prose p").first();
await para.click();
await page.keyboard.press("End");
await page.keyboard.press("Shift+Home");
const before = (await spoken()).length;
await button.click();
await bar.waitFor({ timeout: 3000 });
assert((await bar.getByLabel("읽는 문장").innerText()).includes("선택 부분") && (await bar.getByLabel("읽는 문장").innerText()).includes("1/2"), "글을 선택하면 그 부분만 읽는다");
assert((await spoken())[before] === "첫 문장이다.", "선택한 부분의 첫 문장부터 읽는다");
await page.keyboard.press("Escape");
await sleep(300);
assert((await bar.count()) === 0 && !(await highlighted()) && (await button.getAttribute("aria-pressed")) === "false", "Esc를 누르면 그만 읽는다");
assert((await page.evaluate(() => localStorage.getItem("handy-writer.read-aloud-rate"))) === "1.5", "고른 속도를 기억한다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
