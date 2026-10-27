import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, createWriteStream, openSync } from "node:fs";
import { access, constants, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parse } from "yaml";

import type { SelfInstaller, UpdateFileInfo } from "./updater";

/**
 * macOS 자동 업데이트(Squirrel.Mac)는 새 버전의 코드 서명이 지금 앱과 같은 인증서인지 확인한다.
 * Apple Developer ID 없이 임시 서명(ad-hoc)한 앱은 빌드마다 서명이 달라서 항상
 * "Code signature ... did not pass validation"으로 실패한다. 그래서 그런 앱은 zip을 직접 받아
 * 검증한 뒤, 앱이 끝나면 스크립트로 앱 폴더를 바꿔 끼운다.
 */

const run = (file: string, args: string[]) =>
  new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    execFile(file, args, { timeout: 120_000 }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }));
  });

/** 실행 파일 경로에서 `.app` 묶음 경로를 찾는다. 앱 묶음 안이 아니면 null */
export function bundlePathOf(exePath: string): string | null {
  return /^(.+?\.app)\/Contents\/MacOS\/[^/]+$/.exec(exePath)?.[1] ?? null;
}

/** 서명이 없거나 임시 서명이면 Squirrel.Mac으로는 업데이트할 수 없다. */
export async function needsSelfUpdate(bundlePath: string): Promise<boolean> {
  const { ok, stderr } = await run("/usr/bin/codesign", ["-dv", bundlePath]);
  return !ok || /Signature=adhoc/.test(stderr) || /TeamIdentifier=not set/.test(stderr);
}

/** 지금 CPU에 맞는 zip을 고른다 (없으면 아무 zip이나). */
export function pickZip(files: UpdateFileInfo[], arch: string): UpdateFileInfo | null {
  const zips = files.filter((file) => file.url.endsWith(".zip"));
  return zips.find((file) => file.url.includes(`-${arch}.`)) ?? zips[0] ?? null;
}

export interface Feed {
  owner: string;
  repo: string;
}

/** electron-builder가 앱 안에 넣어 둔 app-update.yml에서 GitHub 저장소를 읽는다. */
export async function readFeed(resourcesPath: string): Promise<Feed> {
  const config = parse(await readFile(join(resourcesPath, "app-update.yml"), "utf8")) as Partial<Feed> & { provider?: string };
  if (config.provider !== "github" || !config.owner || !config.repo) throw new Error("app-update.yml에 GitHub 저장소 정보가 없어요.");
  return { owner: config.owner, repo: config.repo };
}

export function assetUrl(feed: Feed, version: string, file: string) {
  return `https://github.com/${feed.owner}/${feed.repo}/releases/download/v${version}/${encodeURIComponent(file)}`;
}

type FetchLike = (url: string) => Promise<Response>;

/** 받으면서 sha512를 계산하고, latest-mac.yml의 값과 다르면 지운다. */
export async function downloadVerified(fetchImpl: FetchLike, url: string, dest: string, file: UpdateFileInfo, onProgress: (percent: number) => void) {
  const response = await fetchImpl(url);
  if (!response.ok || !response.body) throw new Error(`새 버전을 받지 못했어요 (HTTP ${response.status}).`);
  const total = Number(response.headers.get("content-length")) || file.size || 0;
  const hash = createHash("sha512");
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      received += chunk.length;
      if (total) onProgress(Math.min(100, (received / total) * 100));
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), meter, createWriteStream(dest));
  if (hash.digest("base64") !== file.sha512) {
    await rm(dest, { force: true });
    throw new Error("받은 파일이 손상됐어요 (sha512 불일치). 다시 확인해 주세요.");
  }
}

/** 앱이 완전히 끝난 뒤 새 버전으로 바꾼다. 복사에 실패하면 원래 앱을 되돌린다. */
export const SWAP_SCRIPT = `#!/bin/bash
pid="$1"; target="$2"; next="$3"; relaunch="$4"
for _ in $(seq 1 300); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
backup="$target.old-$$"
if mv "$target" "$backup"; then
  if ditto "$next" "$target"; then
    xattr -cr "$target" 2>/dev/null
    rm -rf "$backup" "$next"
    echo "updated"
  else
    rm -rf "$target"
    mv "$backup" "$target"
    echo "copy failed, restored"
  fi
else
  echo "cannot move $target"
fi
if [ "$relaunch" = "1" ]; then open "$target"; fi
`;

interface MacInstallerOptions {
  bundlePath: string;
  resourcesPath: string;
  /** 받은 파일과 스크립트를 둘 곳 */
  workDir: string;
  arch: string;
  fetch: FetchLike;
  quit: () => void;
}

export function createMacSelfInstaller({ bundlePath, resourcesPath, workDir, arch, fetch: fetchImpl, quit }: MacInstallerOptions): SelfInstaller {
  let nextApp: string | null = null;

  return {
    async download(info, onProgress) {
      // dmg에서 바로 열었거나 macOS가 격리 위치(App Translocation)로 옮겨 실행하면 앱을 바꿀 수 없다.
      try {
        await access(dirname(bundlePath), constants.W_OK);
        await access(bundlePath, constants.W_OK);
      } catch {
        throw new Error(`앱 폴더(${dirname(bundlePath)})에 쓸 수 없어요. 앱을 '응용 프로그램' 폴더로 옮긴 뒤 다시 열어 주세요.`);
      }
      const file = pickZip(info.files ?? [], arch);
      if (!file) throw new Error("새 버전의 맥용 zip을 찾지 못했어요.");

      await rm(workDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true });
      const zip = join(workDir, "update.zip");
      await downloadVerified(fetchImpl, assetUrl(await readFeed(resourcesPath), info.version, file.url), zip, file, onProgress);

      const extracted = join(workDir, "app");
      if (!(await run("/usr/bin/ditto", ["-x", "-k", zip, extracted])).ok) throw new Error("새 버전의 압축을 풀지 못했어요.");
      await rm(zip, { force: true });
      const name = (await readdir(extracted)).find((entry) => entry.endsWith(".app"));
      if (!name) throw new Error("받은 파일에 앱이 없어요.");
      const candidate = join(extracted, name);
      // 임시 서명이어도 서명이 깨지지 않았는지는 확인할 수 있다.
      const verify = await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", candidate]);
      if (!verify.ok) throw new Error(`받은 앱의 서명이 올바르지 않아요: ${verify.stderr.trim().split("\n")[0] ?? ""}`);
      // 끝나는 중에도 바로 실행할 수 있게 스크립트를 미리 써 둔다.
      await writeFile(join(workDir, "install.sh"), SWAP_SCRIPT, { mode: 0o755 });
      nextApp = candidate;
    },

    install(relaunch) {
      if (!nextApp) return;
      // 앱을 끄는 중에도 불릴 수 있으므로 기다리지 않고 바로 띄운다. 결과는 install.log에 남는다.
      const log = openSync(join(workDir, "install.log"), "a");
      spawn("/bin/bash", [join(workDir, "install.sh"), String(process.pid), bundlePath, nextApp, relaunch ? "1" : "0"], {
        detached: true,
        stdio: ["ignore", log, log],
      }).unref();
      closeSync(log);
      nextApp = null;
      if (relaunch) quit();
    },
  };
}
