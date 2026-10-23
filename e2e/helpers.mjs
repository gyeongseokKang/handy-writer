import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const electronPath = createRequire(import.meta.url)("electron");
export const ROOT = path.resolve(import.meta.dirname, "..");
export const OUT = path.join(ROOT, "test-results");
fs.mkdirSync(OUT, { recursive: true });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createReporter() {
  return {
    ok: (message) => console.log("ok  :", message),
    assert(condition, message) {
      if (!condition) {
        console.log("FAIL:", message);
        process.exitCode = 1;
      } else {
        console.log("ok  :", message);
      }
    },
  };
}

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/** 한글 음절 하나를 IME가 거치는 단계로 쪼갠다: 콜 → ㅋ, 코, 콜 */
export function compositionSteps(syllable) {
  const code = syllable.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return [syllable];
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;
  const steps = [CHO[cho], String.fromCharCode(0xac00 + cho * 588 + jung * 28)];
  if (jong) steps.push(syllable);
  return steps;
}

/** 작업 폴더와 사용자 데이터 폴더를 만들고 앱을 띄운다. `files`는 { 상대경로: 내용 } */
export async function launchApp({ files = {}, open } = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hw-ws-"));
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "hw-ud-"));
  fs.writeFileSync(path.join(ud, "config.json"), JSON.stringify({ workspaceRoot: ws }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
    fs.writeFileSync(path.join(ws, rel), content);
  }

  const app = await electron.launch({
    executablePath: electronPath,
    args: [ROOT, "--no-sandbox", "--disable-gpu", `--user-data-dir=${ud}`],
    env: { ...process.env, HANDY_WRITER_CLAUDE_PATH: path.join(ROOT, "e2e", "fake-claude.mjs") },
  });
  const page = await app.firstWindow();
  const logs = [];
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.waitForSelector("nav[aria-label='글 목록']");
  if (open) {
    await page.click(`nav[aria-label='글 목록'] >> text=${open}`);
    await page.waitForSelector(".note-prose");
  }

  // 한글 입력기(IME)가 보내는 것과 같은 composition 이벤트를 흘려보낸다.
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    window.__composition = { starts: 0, ends: 0 };
    document.addEventListener("compositionstart", () => window.__composition.starts++, true);
    document.addEventListener("compositionend", () => window.__composition.ends++, true);
  });
  const ime = {
    type: (text) => cdp.send("Input.insertText", { text }),
    /** 조합 중인 글자를 바꾼다 (확정하지 않는다) */
    set: (text) => cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length }),
    /** 낱말을 한 글자씩 조합하며 입력한다. commitLast가 false면 마지막 글자는 조합 중으로 둔다. */
    async compose(word, { commitLast = true } = {}) {
      const syllables = [...word];
      for (let i = 0; i < syllables.length; i++) {
        for (const step of compositionSteps(syllables[i])) await ime.set(step);
        if (i < syllables.length - 1 || commitLast) await ime.type(syllables[i]);
      }
    },
    counts: () => page.evaluate(() => ({ ...window.__composition })),
  };
  /** 조합 중에 브라우저가 보내는 것과 같은 Enter(isComposing, keyCode 229) */
  const composingEnter = (selector) =>
    page.evaluate((sel) => {
      document.querySelector(sel).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    }, selector);

  return { app, page, ws, ud, logs, ime, composingEnter, close: () => app.close() };
}
