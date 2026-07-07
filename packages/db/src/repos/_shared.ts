/**
 * repo 계층 공통 헬퍼 — DB에 접근하는 격리 가드와 키셋 페이지네이션 조건.
 * 타입 전용 값(MemberContext/Cursor)은 _context.ts에 둔다.
 */
import { AppError } from "@aidetalk/shared";
import type { Column, SQL } from "drizzle-orm";
import { and, eq, gt, lt, or } from "drizzle-orm";

import type { Database } from "../client";
import { conversations } from "../schema/conversations";
import type { Cursor } from "./_context";

/**
 * 대화가 워크스페이스 소유인지 확인. 아니면 not_found로 격리(존재 자체를 숨긴다).
 * message/event/assist repo가 공유한다(멀티테넌트 격리 — CLAUDE.md 규칙 11).
 */
export async function assertConversationOwned(
  db: Database,
  workspaceId: string,
  conversationId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)));
  if (!row) throw AppError.of("not_found", "대화를 찾을 수 없다.");
}

/**
 * Postgres unique_violation(23505) 여부.
 * drizzle-orm이 postgres.js 에러를 감싸므로 code는 err.cause 쪽에 있을 수 있다 —
 * 양쪽 모두 확인해야 한다(직접 err.code만 보면 항상 miss).
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: { code?: string } }).cause;
  return cause?.code === "23505";
}

/**
 * (timestamp, id) 복합 키셋 페이지네이션 커서 조건.
 * 방향에 따라
 *   asc  → (ts, id) > (cursor.ts, cursor.id)  (다음 페이지 = 더 최신)
 *   desc → (ts, id) < (cursor.ts, cursor.id)  (다음 페이지 = 더 과거)
 * 를 만든다. ts 값은 밀리초 정밀도 Date로 비교(messages 스키마 §created_at 주석 참조).
 */
export function keysetCursorCondition(
  tsColumn: Column,
  idColumn: Column,
  cursor: Cursor,
  direction: "asc" | "desc",
): SQL {
  const cursorAt = new Date(cursor.createdAt);
  const cmp = direction === "asc" ? gt : lt;
  return or(cmp(tsColumn, cursorAt), and(eq(tsColumn, cursorAt), cmp(idColumn, cursor.id)))!;
}
