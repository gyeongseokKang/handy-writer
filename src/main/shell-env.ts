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

/** claude가 로그인·연결에 쓰는 환경변수만 로그인 셸에서 가져온다(다른 변수는 앱에 섞지 않는다). */
const AUTH_ENV = /^(ANTHROPIC_|CLAUDE_|CLAUDECODE|HTTPS?_PROXY$|NO_PROXY$|ALL_PROXY$|AWS_|CLOUD_ML_|GOOGLE_APPLICATION_CREDENTIALS$)/i;

export function parseAuthEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of raw.split("\0")) {
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const key = entry.slice(0, eq);
    if (AUTH_ENV.test(key)) out[key] = entry.slice(eq + 1);
  }
  return out;
}

let loginEnvPromise: Promise<Record<string, string>> | null = null;

/** macOS에서 Dock으로 연 앱은 `.zshrc`에 둔 토큰·키(ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN 등)도 못 받는다. */
export function loginShellAuthEnv(): Promise<Record<string, string>> {
  if (process.platform === "win32") return Promise.resolve({});
  loginEnvPromise ??= new Promise((resolve) => {
    const shell = process.env["SHELL"] || "/bin/sh";
    execFile(shell, ["-lic", "env -0"], { timeout: 5000, encoding: "utf8" }, (error, stdout) => {
      resolve(error ? {} : parseAuthEnv(stdout));
    });
  });
  return loginEnvPromise;
}
