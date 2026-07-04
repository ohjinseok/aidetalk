import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "jsdom",
    // 단위 테스트는 src만. e2e(Playwright .spec.ts)는 vitest가 수집하지 않도록 제외.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
