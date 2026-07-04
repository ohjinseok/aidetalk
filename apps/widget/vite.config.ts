import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

/**
 * 본체(app.js) 빌드 + 데모 dev 서버.
 * IIFE 단일 파일로 번들 — 로더가 <script src="/widget/v{n}/app.js">로 로드(06 §1).
 * 번들 예산: gzip 50KB (size-limit CI).
 */
export default defineConfig({
  plugins: [preact()],
  define: {
    __WIDGET_VERSION__: JSON.stringify("1"),
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
