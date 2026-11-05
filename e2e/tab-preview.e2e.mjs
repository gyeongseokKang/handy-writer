// 탭에 마우스를 올리면 그 글을 작게 미리 보여 주는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:tab-preview`
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const env = await launchApp({
  open: "지금 글",
  files: {
    "지금 글.md": "지금 쓰는 글\n",
    "발행본/긴 제목의 다른 글.md": "---\ntags: [요즘IT]\n---\n# 들어가며\n\n**AI 리뷰**를 [[지금 글|이 글]]처럼 쓰기 시작했습니다.\n\n- 첫째 이유\n",
  },
});
const { page, logs } = env;
const tree = page.getByRole("navigation", { name: "글 목록", exact: true });

// 다른 글을 새 탭으로 열었다가 원래 글로 돌아온다
await tree.getByText("긴 제목의 다른 글").click({ modifiers: ["Control"] });
await sleep(300);
await page.getByRole("tab", { name: "지금 글" }).click();
await sleep(300);

const other = page.getByRole("tab", { name: /긴 제목의 다른 글/ });
assert((await other.getAttribute("title")) === null, "탭에 경로만 뜨던 기본 말풍선은 없다");
await other.hover();
const card = page.getByRole("tooltip", { name: "긴 제목의 다른 글 미리보기" });
await card.waitFor({ timeout: 3000 });
const text = await card.innerText();
assert(text.includes("발행본"), "미리보기에 폴더가 보인다");
assert(text.includes("들어가며") && text.includes("AI 리뷰를 이 글처럼 쓰기 시작했습니다.") && text.includes("• 첫째 이유"), `앞부분이 서식 기호 없이 보인다 (${text.replace(/\n/g, " / ")})`);
assert(!text.includes("tags") && !text.includes("[["), "속성과 링크 기호는 보이지 않는다");
await page.screenshot({ path: path.join(OUT, "tab-preview.png") });
await page.mouse.move(600, 500);
await sleep(200);
assert((await card.count()) === 0, "마우스가 벗어나면 닫힌다");
await page.getByRole("tab", { name: "지금 글" }).hover();
await sleep(800);
assert((await page.getByRole("tooltip").count()) === 0, "지금 보고 있는 탭은 미리보기를 띄우지 않는다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
