/**
 * 마이그레이션 실행 엔트리 — `pnpm db:migrate`.
 * DATABASE_URL을 사용해 drizzle/ 의 생성된 SQL을 순서대로 적용한다.
 * 부팅 엔트리포인트(docker)에서도 이 스크립트를 호출한다(10 문서 §2).
 */
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDbConnection } from "./client";

/** 마이그레이션 폴더 절대 경로(패키지 루트의 drizzle/). */
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

// CLI로 직접 실행된 경우에만 동작(import 시에는 부수효과 없음).
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  runMigrations()
    .then(() => {
      console.log("마이그레이션 완료");
      process.exit(0);
    })
    .catch((err) => {
      console.error("마이그레이션 실패:", err);
      process.exit(1);
    });
}
