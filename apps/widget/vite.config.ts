import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

import { WIDGET_VERSION } from "./version";

/**
 * 본체(app.js) 빌드 + 데모 dev 서버.
 * IIFE 단일 파일로 번들 — 로더가 <script src="/widget/v{n}/app.js">로 로드(06 §1).
 * 번들 예산: gzip 50KB (size-limit CI).
 */
export default defineConfig({
  plugins: [preact()],
  define: {
    __WIDGET_VERSION__: JSON.stringify(WIDGET_VERSION),
  },
  // json.stringify=false로 named export를 보존 → @aidetalk/i18n/widget이 로케일 json의
  // widget 섹션만 남기고 나머지(dashboard/errors/server)를 트리셰이킹으로 제거할 수 있게 한다.
  json: {
    stringify: false,
  },
  server: {
    port: 5173,
  },
  build: {
    target: "es2019",
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/app/index.ts",
      formats: ["iife"],
      name: "AideTalkApp",
      fileName: () => "app.js",
    },
    rollupOptions: {
      output: {
        // 위젯은 자급형 단일 파일 — 외부 청크 금지.
        inlineDynamicImports: true,
      },
    },
  },
});
