import { protocol } from "electron";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { ASSET_SCHEME } from "../shared/attachments";
import { mimeOf, parseRange, resolveAssetFile } from "./attachments";

/** app이 ready 되기 전에 한 번 불러야 한다. 영상과 오디오를 스트리밍하려면 stream 권한이 필요하다. */
export function registerAssetScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * `handy-asset://vault/<작업 폴더 기준 경로>`로 작업 폴더 안의 이미지, 영상, 오디오, PDF만 보낸다.
 * 폴더 밖 경로, 숨김 폴더, 그 밖의 파일 형식은 거부한다.
 */
export function handleAssetProtocol(getRoot: () => string | null) {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const root = getRoot();
    if (!root) return text(404, "작업 폴더가 없어요.");
    const url = new URL(request.url);
    if (url.host !== "vault") return text(404, "알 수 없는 주소예요.");

    let abs: string;
    try {
      abs = resolveAssetFile(root, url.pathname.split("/").filter(Boolean).map(decodeURIComponent).join("/"));
    } catch {
      return text(403, "열 수 없는 파일이에요.");
    }

    const info = await stat(abs).catch(() => null);
    if (!info?.isFile()) return text(404, "파일이 없어요.");

    const range = parseRange(request.headers.get("range"), info.size);
    if (range === "invalid") return new Response(null, { status: 416, headers: { "content-range": `bytes */${info.size}` } });

    const headers: Record<string, string> = { "content-type": mimeOf(abs), "accept-ranges": "bytes", "cache-control": "no-cache" };
    if (!range) {
      headers["content-length"] = String(info.size);
      return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, { status: 200, headers });
    }
    headers["content-length"] = String(range.end - range.start + 1);
    headers["content-range"] = `bytes ${range.start}-${range.end}/${info.size}`;
    return new Response(Readable.toWeb(createReadStream(abs, range)) as ReadableStream, { status: 206, headers });
  });
}

