// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useUpdateStore } from "@/entities/update/model/use-update-store";

// 빌드에서 넣어 주는 __APP_VERSION__을 컴포넌트를 불러오기 전에 채운다.
vi.hoisted(() => {
  (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = "0.1.3";
});
vi.mock("@/shared/api/handy-api", () => ({ api: { update: { check: vi.fn(), install: vi.fn() } } }));

import { UpdateRow } from "./update-row";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render() {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(createElement(UpdateRow)));
  const html = container.innerHTML;
  act(() => root.unmount());
  return html;
}

describe("업데이트 줄", () => {
  it("최신 버전이면 문구 대신 버전과 latest 뱃지를 보여준다", () => {
    useUpdateStore.setState({ state: { status: "none" } });
    const html = render();
    expect(html).toContain("v0.1.3");
    expect(html).toContain(">latest<");
    expect(html).not.toContain(">최신 버전이에요<");
  });

  it("그 밖의 상태에서는 문구와 버전을 함께 보여주고 뱃지는 없다", () => {
    useUpdateStore.setState({ state: { status: "ready", version: "0.1.4" } });
    expect(render()).toContain("새 버전 0.1.4 준비됨");
    useUpdateStore.setState({ state: { status: "idle" } });
    const html = render();
    expect(html).toContain("업데이트 확인");
    expect(html).toContain("v0.1.3");
    expect(html).not.toContain("latest");
  });
});
