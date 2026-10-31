import { BrowserWindow, clipboard, ClipboardItem, dialog, nativeImage, net } from "electron";
import { readFile, writeFile } from "node:fs/promises";

import { ASSET_SCHEME } from "../shared/attachments";
import { isDocModel } from "../shared/docx-model";
import { assetPathOf, buildHtmlDocument, EXPORT_FORMATS, exportFileName, inlineAssets, type ExportRequest, type ExportResult } from "../shared/export";
import { mimeOf, resolveAssetFile } from "./attachments";
import { buildDocx, imageTypeOf, type ImageLoader } from "./docx";

/** 원격 그림을 받을 때 기다리는 시간과 최대 크기 */
const REMOTE_IMAGE_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

/** Word에 넣을 그림을 읽는다. Word가 못 받는 형식(webp, svg 등)은 PNG로 바꿔 본다. */
function docxImageLoader(root: string): ImageLoader {
  return async (src) => {
    let data: Uint8Array;
    if (src.startsWith(`${ASSET_SCHEME}://`)) data = await readFile(resolveAssetFile(root, assetPathOf(src)));
    else if (src.startsWith("data:")) data = Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
    else if (/^https?:\/\//i.test(src)) {
      const response = await net.fetch(src, { signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS) });
      if (!response.ok) return null;
      data = new Uint8Array(await response.arrayBuffer());
    } else return null;
    if (data.byteLength > MAX_IMAGE_BYTES) return null;
    const type = imageTypeOf(data);
    if (type) return { data, type };
    const image = nativeImage.createFromBuffer(Buffer.from(data));
    return image.isEmpty() ? null : { data: image.toPNG(), type: "png" };
  };
}

/** 본문 HTML을 보이지 않는 창에 그려서 PDF로 뽑는다. 스크립트는 켜지 않는다. */
async function renderPdf(html: string) {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html).toString("base64")}`);
    return await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
  } finally {
    win.destroy();
  }
}

function loadAsset(root: string) {
  return async (path: string) => {
    const abs = resolveAssetFile(root, path);
    return { mime: mimeOf(abs), base64: (await readFile(abs)).toString("base64") };
  };
}

/** 블로그·메일 편집기에 붙여 넣을 수 있게 서식 있는 HTML과 일반 글을 함께 클립보드에 넣는다. */
export async function copyNote(root: string, bodyHtml: string, text: string) {
  const html = await inlineAssets(bodyHtml, loadAsset(root));
  await clipboard.write([new ClipboardItem({ "text/html": html, "text/plain": text })]);
}

/** 저장 위치를 물어보고 글을 내보낸다. 저장 창에서 취소하면 path가 null이다. */
export async function exportNote(root: string, parent: BrowserWindow | null, request: ExportRequest): Promise<ExportResult> {
  const { format } = request;
  if (!(format in EXPORT_FORMATS)) throw new Error(`지원하지 않는 형식이에요: ${String(format)}`);

  const options = {
    title: "내보내기",
    defaultPath: exportFileName(request.name, format),
    filters: [{ name: EXPORT_FORMATS[format].label, extensions: [EXPORT_FORMATS[format].extension] }],
  };
  const picked = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
  if (picked.canceled || !picked.filePath) return { path: null };

  if (format === "md") {
    await writeFile(picked.filePath, request.content, "utf8");
    return { path: picked.filePath };
  }

  if (format === "docx") {
    const model: unknown = JSON.parse(request.content);
    if (!isDocModel(model)) throw new Error("Word로 바꿀 내용을 읽지 못했어요.");
    await writeFile(picked.filePath, await buildDocx(model, docxImageLoader(root)));
    return { path: picked.filePath };
  }

  const body = await inlineAssets(request.content, loadAsset(root));
  const html = buildHtmlDocument(request.name, body);
  if (format === "html") await writeFile(picked.filePath, html, "utf8");
  else await writeFile(picked.filePath, await renderPdf(html));
  return { path: picked.filePath };
}
