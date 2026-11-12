// 글의 이미지를 누르면 오른쪽 첨부 탭이 열리고 그 이미지의 설정(라벨·크기)이 펼쳐지는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:embed-click`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const env = await launchApp({
  open: "그림 글",
  files: { "그림 글.md": "첫 문단\n\n![[하나.png|첫 그림]]\n\n가운데 문단\n\n![[둘.png|둘째 그림]]\n" },
  setup: (ws) => {
    fs.mkdirSync(path.join(ws, "attachments"), { recursive: true });
    fs.writeFileSync(path.join(ws, "attachments", "하나.png"), png);
    fs.writeFileSync(path.join(ws, "attachments", "둘.png"), png);
  },
});
const { app, page, logs } = env;

const tab = page.getByRole("tablist", { name: "패널 보기" }).getByRole("tab", { name: /첨부/ });
assert((await tab.getAttribute("aria-selected")) !== "true", "처음에는 첨부 탭이 아니다");
await page.locator(".note-prose img.embed-media").nth(1).click();
await sleep(500);
assert((await tab.getAttribute("aria-selected")) === "true", "이미지를 누르면 오른쪽 첨부 탭이 열린다");
const second = page.locator("li[aria-label='둘.png'] > button[aria-expanded]");
const first = page.locator("li[aria-label='하나.png'] > button[aria-expanded]");
assert((await second.getAttribute("aria-expanded")) === "true" && (await first.getAttribute("aria-expanded")) === "false", "누른 이미지의 설정만 펼쳐진다");
assert((await page.locator("li[aria-label='둘.png'] input").evaluateAll((els) => els.some((el) => el.value === "둘째 그림"))), "그 이미지의 라벨을 바로 고칠 수 있다");
await page.screenshot({ path: path.join(OUT, "embed-click.png") });

// 패널을 접어 두었어도 이미지를 누르면 다시 펼친다
await page.getByRole("button", { name: "오른쪽 패널" }).click();
await sleep(300);
await page.locator(".note-prose img.embed-media").nth(0).click();
await sleep(500);
assert((await first.getAttribute("aria-expanded")) === "true", "패널을 접어 두었어도 다시 열고 그 이미지를 펼친다");

// 그림 오른쪽 위의 복사 버튼: 그림 파일을 찾아 그림 그대로 클립보드에 넣는다 (첨부 설정은 열지 않는다)
await page.keyboard.press("Escape");
const firstEmbed = page.locator(".note-prose .embed").first();
await firstEmbed.hover();
const copyButton = firstEmbed.getByRole("button", { name: "그림 복사" });
assert((await copyButton.evaluate((el) => getComputedStyle(el).opacity)) === "1", "그림에 올리면 오른쪽 위에 복사 버튼이 보인다");
await copyButton.click();
await sleep(500);
const clip = await app.evaluate(async ({ clipboard }) => {
  const items = await clipboard.read();
  const item = items.find((i) => i.types.includes("image/png"));
  return item ? (await item.getType("image/png")).size : 0;
});
assert(clip > 0 && (await copyButton.innerText()).includes("복사됨"), `복사 버튼을 누르면 그림이 클립보드에 들어간다 (${clip}바이트)`);

// 그림만 고르면 선택 막대에 수정·퇴고를 띄우지 않는다
await page.locator(".note-prose img.embed-media").first().click();
await sleep(400);
assert((await page.getByRole("button", { name: "퇴고하기" }).count()) === 0, "그림을 고르면 수정·퇴고가 뜨지 않는다");
await page.locator(".note-prose p").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Shift+Home");
await sleep(400);
assert((await page.getByRole("button", { name: "퇴고하기" }).isVisible()), "글자를 고르면 수정·퇴고가 뜬다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
