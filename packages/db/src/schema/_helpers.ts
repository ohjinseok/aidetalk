/**
 * 스키마 공통 컬럼 헬퍼 — 03_DATA_MODEL.md §0.
 * 모든 테이블: created_at timestamptz not null default now().
 * 변경 가능한 테이블은 updated_at도.
 */
import { timestamp } from "drizzle-orm/pg-core";

/** created_at — 전 테이블 공통. */
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** updated_at — 변경 가능한 테이블에만. */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
