import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// vitest/config의 defineConfig는 Vite 설정 + test 필드를 함께 지원한다.
export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
  },
});
