// 글 칸 오른쪽 스크롤바에 마우스를 올리면 그 높이의 내용을 작게 미리 보여 주는지 실제 앱에서 확인한다.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:scroll-peek`
import path from "node:path";

import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";

const { assert } = createReporter();
const section = (n) => `## ${n}번째 장\n\n${Array.from({ length: 6 }, (_, i) => `${n}장의 ${i + 1}번째 문단입니다. 길게 써서 화면을 넘기게 합니다.`).join("\n\n")}`;
const env = await launchApp({ open: "긴 글", files: { "긴 글.md": Array.from({ length: 8 }, (_, i) => section(i + 1)).join("\n\n") + "\n" } });
const { page, logs } = env;
const scroller = page.locator("[data-note-scroller]").first();
const box = await scroller.boundingBox();
const peek = page.getByRole("tooltip", { name: "이 위치 미리보기" });

await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await sleep(200);
assert((await peek.count()) === 0, "글 위에서는 미리보기가 뜨지 않는다");

await page.mouse.move(box.x + box.width - 4, box.y + box.height * 0.85);
await sleep(300);
assert(await peek.isVisible(), "스크롤바에 올리면 미리보기가 뜬다");
const late = await peek.innerText();
assert(/[678]번째 장/.test(late) && /\d+%/.test(late), `아래쪽에 올리면 뒷부분 제목과 위치가 보인다 (${late.split("\n")[0]})`);
await page.screenshot({ path: path.join(OUT, "scroll-peek.png") });

// 스크롤바 위에서 휠을 굴리면(스크롤바를 끌 때처럼) 미리보기가 지금 위치를 따라간다
await page.mouse.move(box.x + box.width - 4, box.y + 10);
await sleep(300);
const atTop = await peek.innerText();
const topY = (await peek.boundingBox()).y;
await page.mouse.wheel(0, 2500);
await sleep(500);
assert(await peek.isVisible(), "스크롤해도 미리보기가 사라지지 않는다");
const scrolled = await peek.innerText();
assert(scrolled.split("\n")[0] !== atTop.split("\n")[0] || /\d+%/.exec(scrolled)?.[0] !== /\d+%/.exec(atTop)?.[0], `스크롤하면 미리보기 내용이 따라 바뀐다 (${atTop.split("\n")[0]} → ${scrolled.split("\n")[0]})`);
assert((await peek.boundingBox()).y > topY, "카드도 스크롤바 손잡이를 따라 내려간다");
await page.locator("[data-note-scroller]").first().evaluate((el) => (el.scrollTop = 0));
await page.mouse.move(box.x + box.width - 4, box.y + 10);
await sleep(300);
const early = await peek.innerText();
assert(early.includes("1번째 장") || early.includes("글 처음"), `위쪽에 올리면 앞부분이 보인다 (${early.split("\n")[0]})`);
assert((await page.locator(".ProseMirror").count()) === 1, "미리보기는 편집되는 에디터가 아니다");

await page.mouse.move(box.x + box.width / 2, box.y + 100);
await sleep(200);
assert((await peek.count()) === 0, "스크롤바에서 벗어나면 사라진다");

assert(logs.length === 0, `콘솔 오류/경고 없음 ${logs.join(" | ")}`);
await env.close();
