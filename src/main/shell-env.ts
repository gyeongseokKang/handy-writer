import { execFile } from "node:child_process";

const PATH_MARKER = "__HANDY_WRITER_PATH__";

let loginPathPromise: Promise<string> | null = null;

/** macOS에서 Dock으로 연 앱은 터미널의 PATH를 물려받지 못해서, 로그인 셸의 PATH를 따로 읽는다. */
export function loginShellPath(): Promise<string> {
  if (process.platform === "win32") return Promise.resolve(process.env["PATH"] ?? "");
  loginPathPromise ??= new Promise((resolve) => {
    const shell = process.env["SHELL"] || "/bin/sh";
    execFile(shell, ["-lc", `printf "${PATH_MARKER}%s${PATH_MARKER}" "$PATH"`], { timeout: 5000 }, (error, stdout) => {
      const match = new RegExp(`${PATH_MARKER}(.*)${PATH_MARKER}`, "s").exec(stdout);
      resolve(!error && match?.[1] ? match[1] : "");
    });
  });
  return loginPathPromise;
}
