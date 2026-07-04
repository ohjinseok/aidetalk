import { defineConfig } from "vite";

/**
 * 로더(widget.js) 빌드 — 06 §1.1.
 * 의존성 0, 순수 JS, IIFE. 번들 예산: gzip 2KB (size-limit CI).
 * app.js를 먼저 빌드한 뒤 실행하므로 emptyOutDir=false로 산출물을 보존한다.
 */
export default defineConfig({
  define: {
    __WIDGET_VERSION__: JSON.stringify("1"),
  },
  build: {
    target: "es2019",
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/loader/loader.ts",
      formats: ["iife"],
      name: "AideTalkLoader",
      fileName: () => "widget.js",
    },
  },
});
