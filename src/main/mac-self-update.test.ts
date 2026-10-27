import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { assetUrl, bundlePathOf, createMacSelfInstaller, downloadVerified, pickZip, readFeed, SWAP_SCRIPT } from "./mac-self-update";

const sha512 = (data: Buffer) => createHash("sha512").update(data).digest("base64");
const serve = (data: Buffer) => vi.fn(async () => new Response(new Uint8Array(data), { headers: { "content-length": String(data.length) } }));

describe("서명 없는 맥 앱의 직접 업데이트", () => {
  it("실행 파일 경로에서 앱 묶음 경로를 찾는다", () => {
    expect(bundlePathOf("/Applications/Handy Writer.app/Contents/MacOS/Handy Writer")).toBe("/Applications/Handy Writer.app");
    expect(bundlePathOf("/usr/local/bin/electron")).toBeNull();
  });

  it("CPU에 맞는 zip을 고른다", () => {
    const files = [
      { url: "Handy-Writer-0.2.0-mac-x64.zip", sha512: "a" },
      { url: "Handy-Writer-0.2.0-mac-arm64.dmg", sha512: "b" },
      { url: "Handy-Writer-0.2.0-mac-arm64.zip", sha512: "c" },
    ];
    expect(pickZip(files, "arm64")?.sha512).toBe("c");
    expect(pickZip(files, "ia32")?.sha512).toBe("a");
    expect(pickZip([{ url: "x.dmg", sha512: "d" }], "arm64")).toBeNull();
  });

  it("app-update.yml에서 저장소를 읽어 내려받을 주소를 만든다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hw-feed-"));
    writeFileSync(join(dir, "app-update.yml"), "owner: gyeongseokKang\nrepo: handy-writer\nprovider: github\nreleaseType: release\n");
    const feed = await readFeed(dir);
    expect(assetUrl(feed, "0.2.0", "Handy Writer-0.2.0.zip")).toBe("https://github.com/gyeongseokKang/handy-writer/releases/download/v0.2.0/Handy%20Writer-0.2.0.zip");
    writeFileSync(join(dir, "app-update.yml"), "provider: generic\nurl: https://example.com\n");
    await expect(readFeed(dir)).rejects.toThrow("GitHub");
  });

  it("받으면서 진행률을 알리고, sha512가 다르면 파일을 지운다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hw-dl-"));
    const data = Buffer.alloc(100_000, 7);
    const progress: number[] = [];
    await downloadVerified(serve(data), "https://x", join(dir, "ok.zip"), { url: "ok.zip", sha512: sha512(data) }, (p) => progress.push(p));
    expect(readFileSync(join(dir, "ok.zip")).equals(data)).toBe(true);
    expect(progress.at(-1)).toBe(100);

    await expect(downloadVerified(serve(data), "https://x", join(dir, "bad.zip"), { url: "bad.zip", sha512: "틀림" }, () => {})).rejects.toThrow("sha512");
    expect(existsSync(join(dir, "bad.zip"))).toBe(false);

    const notFound = vi.fn(async () => new Response("no", { status: 404 }));
    await expect(downloadVerified(notFound, "https://x", join(dir, "nf.zip"), { url: "nf.zip", sha512: "" }, () => {})).rejects.toThrow("HTTP 404");
  });
});

/** 임시 서명한 가짜 앱 묶음을 만든다. */
function fakeApp(dir: string, marker: string) {
  const app = join(dir, "Handy Writer.app");
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  writeFileSync(join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Handy Writer</string><key>CFBundleIdentifier</key><string>com.handy.writer</string></dict></plist>`);
  copyFileSync("/usr/bin/true", join(app, "Contents", "MacOS", "Handy Writer"));
  mkdirSync(join(app, "Contents", "Resources"));
  writeFileSync(join(app, "Contents", "Resources", "marker.txt"), marker);
  execFileSync("/usr/bin/codesign", ["-s", "-", "--force", app]);
  return app;
}

describe.runIf(process.platform === "darwin")("맥에서 실제로 받아서 바꿔 끼우기", () => {
  it("zip을 받아 풀고 서명을 확인한 뒤, 스크립트가 앱을 새 버전으로 바꾼다", async () => {
    const root = mkdtempSync(join(tmpdir(), "hw-swap-"));
    mkdirSync(join(root, "installed"));
    mkdirSync(join(root, "build"));
    mkdirSync(join(root, "resources"));
    const installed = fakeApp(join(root, "installed"), "0.1.0");
    const built = fakeApp(join(root, "build"), "0.2.0");
    const zip = join(root, "new.zip");
    execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", built, zip]);
    writeFileSync(join(root, "resources", "app-update.yml"), "owner: o\nrepo: r\nprovider: github\n");

    const data = readFileSync(zip);
    const fetch = serve(data);
    const quit = vi.fn();
    const installer = createMacSelfInstaller({ bundlePath: installed, resourcesPath: join(root, "resources"), workDir: join(root, "work"), arch: "arm64", fetch, quit });
    await installer.download({ version: "0.2.0", files: [{ url: "Handy-Writer-0.2.0-mac-arm64.zip", sha512: sha512(data) }] }, () => {});
    expect(fetch).toHaveBeenCalledWith("https://github.com/o/r/releases/download/v0.2.0/Handy-Writer-0.2.0-mac-arm64.zip");

    // install()은 지금 프로세스가 끝나기를 기다리므로, 같은 스크립트를 이미 끝난 pid로 직접 돌려 본다.
    const next = join(root, "work", "app", "Handy Writer.app");
    const result = spawnSync("/bin/bash", ["-c", SWAP_SCRIPT, "swap", "999999", installed, next, "0"], { encoding: "utf8" });
    expect(result.stdout.trim()).toBe("updated");
    expect(readFileSync(join(installed, "Contents", "Resources", "marker.txt"), "utf8")).toBe("0.2.0");
    expect(existsSync(next)).toBe(false);
    expect(spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", installed]).status).toBe(0);
    expect(quit).not.toHaveBeenCalled();
  });

  it("받은 앱의 서명이 깨졌으면 설치하지 않는다", async () => {
    const root = mkdtempSync(join(tmpdir(), "hw-bad-"));
    mkdirSync(join(root, "installed"));
    mkdirSync(join(root, "build"));
    mkdirSync(join(root, "resources"));
    const installed = fakeApp(join(root, "installed"), "0.1.0");
    const built = fakeApp(join(root, "build"), "0.2.0");
    writeFileSync(join(built, "Contents", "Resources", "marker.txt"), "변조");
    const zip = join(root, "new.zip");
    execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", built, zip]);
    writeFileSync(join(root, "resources", "app-update.yml"), "owner: o\nrepo: r\nprovider: github\n");
    const data = readFileSync(zip);
    const installer = createMacSelfInstaller({ bundlePath: installed, resourcesPath: join(root, "resources"), workDir: join(root, "work"), arch: "arm64", fetch: serve(data), quit: () => {} });
    await expect(installer.download({ version: "0.2.0", files: [{ url: "a-arm64.zip", sha512: sha512(data) }] }, () => {})).rejects.toThrow("서명");
  });
});
