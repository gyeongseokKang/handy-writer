// 사이드바 위의 도움말(기능 안내) 창을 실제 앱에서 확인한다: 열기·닫기, 그림(webp) 표시, 찾기, 목록 이동, 지금 써 보기.
// 먼저 `pnpm build`가 필요하다. 리눅스에서는 `xvfb-run -a pnpm test:e2e:help`
import { createReporter, launchApp, OUT, sleep } from "./helpers.mjs";
import path from "node:path";

const { assert } = createReporter();
const env = await launchApp({ open: "글", files: { "글.md": "# 글\n\n## 소제목\n\n본문입니다.\n" } });
const { page, logs } = env;
const dialog = page.getByRole("dialog", { name: "도움말" });
const waitFor = async (check, tries = 40) => {
  for (let i = 0; i < tries && !(await check()); i++) await sleep(150);
  return check();
};

// ── 사이드바 위 아이콘 ──
assert((await page.getByRole("button", { name: "목차 패널" }).count()) === 0, "사이드바 위에서 목차 버튼은 빠졌다");
const helpButton = page.getByRole("button", { name: "도움말", exact: true });
assert(await helpButton.isVisible(), "그 자리에 도움말 아이콘이 있다");
await helpButton.click();
await dialog.waitFor();
assert(await dialog.getByRole("heading", { name: "도움말" }).isVisible(), "누르면 도움말이 열린다");

// ── 기능 목록과 그림 ──
const articles = dialog.getByRole("article");
const total = await articles.count();
assert(total >= 30, `기능이 묶음별로 늘어서 있다 (${total}개)`);
assert((await dialog.getByRole("region").count()) >= 6, "묶음(글쓰기, 정리하고 찾기, 다듬기…)으로 나뉜다");
const first = dialog.locator("article img").first();
await first.scrollIntoViewIfNeeded();
assert(await waitFor(() => first.evaluate((img) => img.complete && img.naturalWidth > 0)), "그림이 실제로 그려진다 (앱에 함께 묶은 webp)");
assert((await first.getAttribute("src"))?.endsWith(".webp"), `그림은 webp다 (${await first.getAttribute("src")})`);
assert((await dialog.locator("article").first().getByRole("heading").innerText()).length > 0, "기능마다 제목과 설명이 있다");
const broken = await dialog.locator("article img").evaluateAll((imgs) => imgs.filter((img) => img.complete && img.naturalWidth === 0 && img.currentSrc).length);
assert(broken === 0, "깨진 그림이 없다");
await page.screenshot({ path: path.join(OUT, "help.png") });

// ── 찾기 ──
const search = dialog.getByLabel("기능 찾기");
await search.fill("원고");
await sleep(300);
assert((await dialog.getByRole("article", { name: "원고 묶기" }).count()) === 1, "낱말로 찾으면 그 기능이 남는다");
assert((await dialog.getByRole("article", { name: "집중 모드" }).count()) === 0 && (await articles.count()) < total, "맞지 않는 기능은 사라진다");
await search.fill("zzzzqqq");
await sleep(300);
assert(await dialog.getByText("맞는 기능이 없어요").isVisible(), "맞는 것이 없으면 안내가 나온다");
await search.fill("");
await sleep(300);
assert((await articles.count()) === total, "지우면 다시 모두 보인다");

// ── 목록에서 이동 ──
await dialog.getByRole("navigation", { name: "기능 목록" }).getByRole("button", { name: "집중 모드", exact: true }).click();
// 멀리 있는 기능은 부드럽게 스크롤하는 동안 시간이 걸린다.
const arrived = async () => {
  const target = await dialog.getByRole("article", { name: "집중 모드" }).boundingBox();
  const frame = await dialog.boundingBox();
  return !!target && !!frame && target.y >= frame.y && target.y < frame.y + frame.height * 0.4;
};
assert(await waitFor(arrived, 60), "목록에서 누르면 그 기능이 창 위쪽으로 온다");

// ── 지금 써 보기 ──
await dialog.getByRole("article", { name: "집중 모드" }).getByRole("button", { name: "지금 써 보기" }).click();
assert(await waitFor(async () => (await dialog.count()) === 0), "지금 써 보기를 누르면 도움말이 닫힌다");
assert(await waitFor(async () => (await page.locator("nav[aria-label='글 목록']").count()) === 0), "그 기능이 실행된다 (집중 모드)");
await page.keyboard.press("Escape");
assert(await waitFor(async () => (await page.locator("nav[aria-label='글 목록']").count()) === 1), "집중 모드를 끈다");

// ── 키와 명령 ──
await page.keyboard.press("F1");
await dialog.waitFor();
assert(true, "F1로 연다");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "detached" });
assert(true, "Esc로 닫는다");
await page.keyboard.press("Control+Shift+P");
await page.getByLabel("검색어").fill(">도움말");
await page.getByRole("option", { name: /도움말/ }).first().click();
await dialog.waitFor();
assert(true, "명령 팔레트에서도 연다");
await dialog.getByRole("button", { name: "닫기" }).click();
await dialog.waitFor({ state: "detached" });

// ── 목차는 설정에서 ──
await page.keyboard.press("Control+,");
const settings = page.getByRole("dialog", { name: "설정" });
await settings.waitFor();
await settings.getByLabel("목차 띄우기").uncheck();
assert((await page.getByRole("navigation", { name: "목차" }).count()) === 0, "목차 켜고 끄기는 설정에서 한다");
await settings.getByLabel("목차 띄우기").check();
await settings.getByRole("button", { name: "도움말 (F1)" }).click();
await dialog.waitFor();
assert(true, "설정에서도 도움말로 간다");

assert(logs.length === 0, `콘솔 오류 없음 ${logs.join(" | ")}`);
await env.close();
