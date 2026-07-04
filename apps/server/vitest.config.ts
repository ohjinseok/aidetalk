import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 임시 Postgres 컨테이너 기동/마이그레이션/정리(09 §1).
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    // DB/WS 통합 테스트를 단일 프로세스에서 순차 실행(연결 경합 방지).
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
