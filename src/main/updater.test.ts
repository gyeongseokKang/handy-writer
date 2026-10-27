import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import type { UpdateState } from "../shared/update";
import { createUpdater, type SelfInstaller, type UpdaterLike } from "./updater";

function fake() {
  const emitter = new EventEmitter();
  const updater = Object.assign(emitter, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: true,
    checkForUpdates: vi.fn(async () => {
      emitter.emit("checking-for-update");
    }),
    quitAndInstall: vi.fn(),
  }) as unknown as UpdaterLike & EventEmitter;
  return updater;
}

describe("createUpdater", () => {
  it("설치된 앱이 아니면 확인하지 않고 이유를 알려준다", async () => {
    const updater = fake();
    const states: UpdateState[] = [];
    const u = createUpdater({ updater, unsupportedReason: () => "개발 모드", onState: (s) => states.push(s) });
    expect(u.getState()).toEqual({ status: "unsupported", reason: "개발 모드" });
    await u.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("확인 → 받는 중 → 준비됨 순서로 상태가 바뀌고, 준비되면 설치할 수 있다", async () => {
    const updater = fake();
    const states: UpdateState[] = [];
    const u = createUpdater({ updater, unsupportedReason: () => null, onState: (s) => states.push(s) });
    expect(updater.autoDownload).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    await u.check();
    updater.emit("update-available", { version: "0.2.0" });
    updater.emit("download-progress", { percent: 42.4 });
    updater.emit("update-downloaded", { version: "0.2.0" });
    expect(states.map((s) => s.status)).toEqual(["checking", "downloading", "downloading", "ready"]);
    expect(states[2]).toMatchObject({ percent: 42.4 });
    u.install();
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("받는 중이거나 준비됐으면 다시 확인하지 않고, 준비 전에는 설치하지 않는다", async () => {
    const updater = fake();
    const u = createUpdater({ updater, unsupportedReason: () => null, onState: () => {} });
    u.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit("update-available", { version: "0.2.0" });
    await u.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("오류는 한 줄로 줄여서 보여주고, 다음에 다시 확인할 수 있다", async () => {
    const updater = fake();
    (updater.checkForUpdates as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("404 Not Found\nheaders: ..."));
    const u = createUpdater({ updater, unsupportedReason: () => null, onState: () => {} });
    expect(await u.check()).toEqual({ status: "error", message: "404 Not Found" });
    await u.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("최신 버전이면 none", async () => {
    const updater = fake();
    const u = createUpdater({ updater, unsupportedReason: () => null, onState: () => {} });
    updater.emit("update-not-available");
    expect(u.getState().status).toBe("none");
  });

  describe("직접 설치 (서명 없는 맥 앱)", () => {
    function selfInstaller(download: SelfInstaller["download"] = async (_info, onProgress) => onProgress(50)) {
      return { download: vi.fn(download), install: vi.fn() };
    }

    it("electron-updater는 확인만 하고, 받기와 설치는 직접 한다", async () => {
      const updater = fake();
      const installer = selfInstaller();
      const states: UpdateState[] = [];
      const u = createUpdater({ updater, unsupportedReason: () => null, onState: (s) => states.push(s), selfInstaller: installer });
      expect(updater.autoDownload).toBe(false);
      expect(updater.autoInstallOnAppQuit).toBe(false);

      updater.emit("update-available", { version: "0.2.0", files: [{ url: "a.zip", sha512: "x" }] });
      await vi.waitFor(() => expect(u.getState().status).toBe("ready"));
      expect(installer.download).toHaveBeenCalledWith({ version: "0.2.0", files: [{ url: "a.zip", sha512: "x" }] }, expect.any(Function));
      expect(states.map((s) => s.status)).toEqual(["downloading", "downloading", "ready"]);
      expect(states[1]).toMatchObject({ percent: 50 });

      u.install();
      u.install();
      u.installOnQuit();
      expect(installer.install).toHaveBeenCalledOnce();
      expect(installer.install).toHaveBeenCalledWith(true);
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });

    it("받아 둔 채로 앱을 끄면 다시 열지 않고 설치한다", async () => {
      const updater = fake();
      const installer = selfInstaller();
      const u = createUpdater({ updater, unsupportedReason: () => null, onState: () => {}, selfInstaller: installer });
      u.installOnQuit();
      expect(installer.install).not.toHaveBeenCalled();
      updater.emit("update-available", { version: "0.2.0" });
      await vi.waitFor(() => expect(u.getState().status).toBe("ready"));
      u.installOnQuit();
      expect(installer.install).toHaveBeenCalledWith(false);
    });

    it("받다가 실패하면 오류를 한 줄로 보여준다", async () => {
      const updater = fake();
      const u = createUpdater({
        updater,
        unsupportedReason: () => null,
        onState: () => {},
        selfInstaller: selfInstaller(async () => {
          throw new Error("받은 파일이 손상됐어요\n자세한 내용");
        }),
      });
      updater.emit("update-available", { version: "0.2.0" });
      await vi.waitFor(() => expect(u.getState()).toEqual({ status: "error", message: "받은 파일이 손상됐어요" }));
    });
  });
});
