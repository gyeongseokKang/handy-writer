// 핸디 리뷰 칸의 플랫폼별 표지: 썸네일·추가·순서·삭제가 글 속성(review.covers)에 저장되는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:review-covers`
import fs from "node:fs";
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
// 1×1 png
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const note = `---
review:
  category: book
  rating: 4
  verdict: 재밌다
  target: 무협 팬
  author: 쥬레이
  bookType: 소설
  covers:
    - src: 시리즈.png
      platform: 네이버 시리즈
---
본문
`;
const env = await launchApp({ open: "마교", files: { "마교.md": note }, setup: (ws) => { fs.mkdirSync(path.join(ws, "attachments"), { recursive: true }); fs.writeFileSync(path.join(ws, "attachments", "시리즈.png"), png); fs.writeFileSync(path.join(ws, "attachments", "문피아.png"), png); } });
const { page, ws, logs } = env;
const read = () => fs.readFileSync(path.join(ws, "마교.md"), "utf8");

const section = page.locator("#review-settings");
await section.waitFor();
const cover = section.getByPlaceholder(/플랫폼별 표지 1번\(네이버 시리즈\)/);
assert((await cover.count()) === 1, "커버를 비워 두면 플랫폼별 표지 1번을 쓴다고 알려 준다");
assert((await section.getByLabel("1번 표지 플랫폼").inputValue()) === "네이버 시리즈", "플랫폼별 표지가 칸에 보인다");
const thumb = section.locator("img[src^='handy-asset']").first();
assert((await thumb.count()) === 1 && (await thumb.evaluate((img) => img.naturalWidth)) > 0, "첨부 표지의 썸네일이 보인다");

await section.getByRole("button", { name: "표지 추가" }).click();
await section.getByLabel("2번 표지 플랫폼").fill("문피아");
await section.getByLabel("2번 표지 그림").fill("문피아.png");
await sleep(900);
assert(/platform: 문피아/.test(read()) && /src: 문피아\.png/.test(read()), "추가한 표지가 글 속성에 저장된다");
await section.getByRole("button", { name: "위로" }).nth(1).click();
await sleep(900);
assert(read().indexOf("문피아.png") < read().indexOf("시리즈.png"), "순서를 바꾸면 저장된 순서도 바뀐다");
await section.screenshot({ path: path.join(OUT, "review-covers.png") });
await section.getByRole("button", { name: "표지 삭제" }).first().click();
await sleep(900);
assert(!read().includes("문피아.png") && read().includes("시리즈.png"), "삭제하면 속성에서도 빠진다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
