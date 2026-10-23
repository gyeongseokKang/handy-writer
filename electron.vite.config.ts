import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { resolve } from "node:path";

const PROD_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

/** 개발 서버(HMR)는 인라인 스크립트가 필요해서, 엄격한 CSP는 빌드 결과물에만 넣는다. */
function productionCsp(): Plugin {
  return {
    name: "production-csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("</title>", `</title>\n    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`),
  };
}

export default defineConfig({
  main: {},
  preload: {
    build: {
      // sandbox: true 인 렌더러는 ESM preload를 못 읽으므로 CommonJS로 내보낸다.
      rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), productionCsp()],
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
  },
});
