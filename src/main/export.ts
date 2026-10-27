import { BrowserWindow, dialog } from "electron";
import { readFile, writeFile } from "node:fs/promises";

import { buildHtmlDocument, EXPORT_FORMATS, exportFileName, inlineAssets, type ExportRequest, type ExportResult } from "../shared/export";
import { mimeOf, resolveAssetFile } from "./attachments";

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

  const body = await inlineAssets(request.content, async (path) => {
    const abs = resolveAssetFile(root, path);
    return { mime: mimeOf(abs), base64: (await readFile(abs)).toString("base64") };
  });
  const html = buildHtmlDocument(request.name, body);
  if (format === "html") await writeFile(picked.filePath, html, "utf8");
  else await writeFile(picked.filePath, await renderPdf(html));
  return { path: picked.filePath };
}
