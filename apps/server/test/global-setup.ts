/**
 * vitest globalSetup — 임시 Postgres 컨테이너 기동 + 마이그레이션, 종료 시 삭제.
 * 09 §1: 통합 테스트는 실제 Postgres 사용(DB mocking 금지).
 */
import { execSync } from "node:child_process";

import { runMigrations } from "@aidetalk/db";

import { TEST_DATABASE_URL, TEST_PG_CONTAINER, TEST_PG_PORT } from "./pg";

function sh(cmd: string, opts: { ignoreError?: boolean } = {}): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch (err) {
    if (opts.ignoreError) return "";
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function setup(): Promise<() => Promise<void>> {
  // 잔여 컨테이너 정리 후 새로 기동.
  sh(`docker rm -f ${TEST_PG_CONTAINER}`, { ignoreError: true });
  sh(
    `docker run -d --name ${TEST_PG_CONTAINER} ` +
      `-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=aidetalk_test ` +
      `-p ${TEST_PG_PORT}:5432 postgres:16-alpine`,
  );

  // pg_isready 폴링(최대 ~60초).
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const out = sh(`docker exec ${TEST_PG_CONTAINER} pg_isready -U postgres`, {
      ignoreError: true,
    });
    if (out.includes("accepting connections")) {
      ready = true;
      break;
    }
    await sleep(1000);
  }
  if (!ready) {
    sh(`docker rm -f ${TEST_PG_CONTAINER}`, { ignoreError: true });
    throw new Error("테스트 Postgres 준비 실패");
  }
  // 컨테이너가 accepting 직후에도 초기화 여유가 필요할 수 있어 짧게 대기.
  await sleep(500);

  await runMigrations(TEST_DATABASE_URL);

  return async () => {
    sh(`docker rm -f ${TEST_PG_CONTAINER}`, { ignoreError: true });
  };
}
