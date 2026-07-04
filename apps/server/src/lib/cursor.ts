/**
 * 키셋 페이지네이션 커서 — 04_API_SPEC.md §0.
 * cursor = 마지막 항목의 (createdAt, id) 정렬키를 base64url로 인코딩.
 * repos의 Cursor { createdAt(ISO), id }와 1:1.
 */
import type { Cursor } from "@aidetalk/db";

/** (createdAt, id) → base64url 커서 문자열. createdAt은 Date 또는 ISO 문자열. */
export function encodeCursor(row: { createdAt: Date | string; id: string }): string {
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
  return Buffer.from(JSON.stringify({ createdAt, id: row.id }), "utf8").toString("base64url");
}

/** 커서 문자열 → Cursor. 형식 오류면 undefined(처음부터 조회). */
export function decodeCursor(cursor?: string | null): Cursor | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Cursor).createdAt === "string" &&
      typeof (parsed as Cursor).id === "string"
    ) {
      return parsed as Cursor;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
