/**
 * @aidetalk/db — Drizzle 스키마 + 마이그레이션 + repository 계층.
 * 03_DATA_MODEL.md가 단일 출처. 모든 repo 함수는 workspaceId를 첫 인자로 받는다(규칙 11,
 * users 등 워크스페이스 밖 리소스는 03 §3 예외).
 */
export const DB_PACKAGE_NAME = "@aidetalk/db" as const;

export * as schema from "./schema";
export * from "./schema";
export * from "./client";
export * from "./crypto";
export * from "./repos";
export { runMigrations } from "./migrate";
