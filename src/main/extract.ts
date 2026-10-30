import { BrowserWindow, session } from "electron";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { youtubeVideoId } from "../shared/draft-sources";
import { cleanTitle, MAX_EXTRACT_HTML, normalizeExtractUrl, textToParagraphs, type ExtractResult } from "../shared/extract";
import { fetchYoutube } from "./youtube";

/** 페이지를 불러오는 최대 시간 */
const LOAD_TIMEOUT_MS = 25_000;
/** 불러온 뒤 스크립트가 본문을 그릴 때까지 기다리는 시간 */
const SETTLE_MS = 800;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let readabilitySource: string | null = null;

/** Readability(파이어폭스 읽기 보기의 본문 추출기) 원본. 페이지 안에 넣어서 돌린다. */
function readability() {
  readabilitySource ??= readFileSync(createRequire(import.meta.url).resolve("@mozilla/readability/Readability.js"), "utf8");
  return readabilitySource;
}

/** 페이지 안에서 Readability로 본문을 뽑는다. 원본 문서를 건드리지 않게 복사본에서 돌린다. */
const extractScript = () => `(() => {
  ${readability()}
  const parsed = new Readability(document.cloneNode(true)).parse();
  if (!parsed) return null;
  return {
    title: parsed.title || document.title || "",
    siteName: parsed.siteName || location.hostname,
    byline: parsed.byline || "",
    html: parsed.content || "",
  };
})()`;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 보이지 않는 창에 페이지를 열어 본문을 뽑는다. 스크립트로 글을 그리는 페이지도 읽을 수 있다.
 * 앱과 저장소를 나누지 않는 임시 세션을 쓰고, 새 창·다운로드는 막는다. 결과는 믿지 않는 자료로 다룬다.
 */
async function extractPage(url: string): Promise<ExtractResult> {
  const partition = `extract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ses = session.fromPartition(partition, { cache: false });
  ses.on("will-download", (event) => event.preventDefault());
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, images: false },
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await withTimeout(win.loadURL(url, { userAgent: USER_AGENT }), LOAD_TIMEOUT_MS, "페이지를 불러오는 데 너무 오래 걸려요.").catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("너무 오래")) throw error;
      // 넘겨주기(redirect) 중에 앞선 요청이 취소된 것(ERR_ABORTED)은 본문을 읽을 수 있으니 넘어간다.
      if (/ERR_ABORTED/.test(message)) return;
      const code = /ERR_[A-Z_]+/.exec(message)?.[0];
      throw new Error(`페이지에 연결하지 못했어요. 주소와 인터넷 연결을 확인해 주세요.${code ? ` (${code})` : ""}`);
    });
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const result = (await win.webContents.executeJavaScript(extractScript(), true)) as Omit<ExtractResult, "url"> | null;
    if (!result || !result.html || !result.html.replace(/<[^>]*>/g, "").trim()) {
      throw new Error("이 페이지에서 본문을 찾지 못했어요.");
    }
    const siteName = String(result.siteName ?? "").trim().slice(0, 100);
    return {
      url: win.webContents.getURL() || url,
      title: cleanTitle(String(result.title ?? ""), siteName).slice(0, 200),
      siteName,
      byline: String(result.byline ?? "").trim().slice(0, 100),
      html: String(result.html).slice(0, MAX_EXTRACT_HTML),
    };
  } finally {
    win.destroy();
    void ses.clearStorageData().catch(() => {});
  }
}

/** 유튜브 영상은 페이지 대신 제목·설명·자막을 가져온다. */
async function extractYoutube(url: string): Promise<ExtractResult> {
  const video = await fetchYoutube(url);
  const parts = [video.description && `<h2>영상 설명</h2>${textToParagraphs(video.description)}`, video.transcript && `<h2>자막 (${video.captionLabel})</h2>${textToParagraphs(video.transcript)}`].filter(Boolean);
  if (parts.length === 0) throw new Error("이 영상에는 설명도 자막도 없어요.");
  return { url: video.url, title: video.title, siteName: "YouTube", byline: video.channel, html: parts.join("") };
}

export async function extractFromUrl(input: string): Promise<ExtractResult> {
  const url = normalizeExtractUrl(String(input ?? ""));
  if (!url) throw new Error("http:// 또는 https://로 시작하는 주소를 넣어 주세요.");
  return youtubeVideoId(url) ? extractYoutube(url) : extractPage(url);
}
