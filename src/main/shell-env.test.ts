import { describe, expect, it } from "vitest";

import { parseAuthEnv } from "./shell-env";

describe("parseAuthEnv", () => {
  it("claude 로그인·연결에 쓰는 변수만 남긴다", () => {
    const raw = ["HOME=/Users/a", "ANTHROPIC_API_KEY=sk-x", "CLAUDE_CODE_OAUTH_TOKEN=tok=en", "HTTPS_PROXY=http://p:1", "SECRET_OTHER=1", "PATH=/bin", ""].join("\0");
    expect(parseAuthEnv(raw)).toEqual({ ANTHROPIC_API_KEY: "sk-x", CLAUDE_CODE_OAUTH_TOKEN: "tok=en", HTTPS_PROXY: "http://p:1" });
  });

  it("빈 입력이나 이상한 줄은 무시한다", () => {
    expect(parseAuthEnv("")).toEqual({});
    expect(parseAuthEnv("=x\0noequals\0")).toEqual({});
  });
});
