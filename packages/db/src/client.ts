/**
 * DB 클라이언트 — postgres-js + Drizzle. 02_ARCHITECTURE.md §1(코어는 일반 Postgres).
 * 코어는 특정 벤더 런타임에 묶이지 않는다: Neon/Supabase/자체 전부 동일 Postgres 연결 문자열.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/** 스키마가 바인딩된 Drizzle DB 타입. repo 함수는 이 타입을 받는다. */
export type Database = PostgresJsDatabase<typeof schema>;

/** 저수준 postgres-js 연결 + drizzle 인스턴스 묶음(종료 시 close 필요). */
export interface DbConnection {
  db: Database;
  /** 연결 풀 종료 — 마이그레이션/스크립트 종료 시 호출. */
  close: () => Promise<void>;
}

/**
 * DATABASE_URL(또는 명시 url)로 연결을 생성한다.
 * @param connectionString 없으면 process.env.DATABASE_URL 사용.
 * @param options postgres-js 옵션(max 등). 마이그레이션은 max:1 권장.
 */
export function createDbConnection(
  connectionString?: string,
  options?: postgres.Options<Record<string, never>>,
): DbConnection {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL이 설정되지 않았다. 연결 문자열이 필요하다.");
  }
  const client = postgres(url, options);
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.end(),
  };
}
