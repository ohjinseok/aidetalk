/**
 * Playwright 설정 — 위젯↔서버 통합 E2E(06 §8 / 09 §7).
 * headless Chromium. CI 연결은 하지 않는다(로컬 검증까지).
 * Postgres·서버·스텁 에이전트·정적 호스트 기동은 globalSetup에서 처리한다.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // 위젯 신뢰성 시나리오는 상태 공유(단일 워크스페이스)라 순차 실행.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
