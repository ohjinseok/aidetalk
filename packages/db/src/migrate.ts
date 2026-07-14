/**
 * 마이그레이션 실행 — DATABASE_URL로 drizzle/ 의 생성된 SQL을 순서대로 적용한다.
 *
 * 이 모듈은 **부수효과가 없다**(import만으로는 아무것도 실행하지 않는다).
 * CLI 진입점은 ./migrate-cli.ts (= `pnpm db:migrate`)로 분리했다.
 * 예전에는 여기서 `process.argv[1] === fileURLToPath(import.meta.url)`로 직접 실행을 감지했는데,
 * 서버 프로덕션 번들(apps/server/build.mjs)에 이 파일이 인라인되면 두 경로가 모두 dist/index.js가 되어
 * **서버 부팅 시 RUN_MIGRATIONS_ON_BOOT와 무관하게 마이그레이션이 자동 실행**되는 버그가 있었다.
 */
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDbConnection } from "./client";

/**
 * 마이그레이션 SQL 폴더의 절대 경로.
 * - 개발/CLI(tsx로 packages/db/src/*.ts 실행): ../drizzle → packages/db/drizzle
 * - 프로덕션 번들(/app/dist/index.js): ../drizzle → /app/drizzle
 *   → docker/server.Dockerfile이 packages/db/drizzle을 이미지의 /app/drizzle로 복사한다(그쪽 주석 참고).
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** 마이그레이션을 실행하고 연결을 닫는다. */
export async function runMigrations(connectionString?: string): Promise<void> {
  // 마이그레이션은 단일 연결로 순차 적용(max:1).
  const { db, close } = createDbConnection(connectionString, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}
