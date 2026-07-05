/**
 * messageRepo — 03_DATA_MODEL.md §3.
 * 첫 인자 workspaceId, 대화 소유 검증을 내부에서 수행(멀티테넌트 격리).
 * 순서 보장: ORDER BY created_at, id.
 */
import type { MessageContent, MessageRole } from "@aidetalk/shared";
import { newId } from "@aidetalk/shared";
import { and, asc, desc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { messages } from "../schema/messages";
import type { Cursor } from "./_context";
import { assertConversationOwned, keysetCursorCondition } from "./_shared";

export interface AppendMessageInput {
  role: MessageRole;
  content: MessageContent;
  authorId?: string | null;
  clientMsgId?: string | null;
}

export function makeMessageRepo(db: Database) {
  return {
    /**
     * 메시지 추가. clientMsgId 중복이면 기존 행을 반환(멱등).
     * clientMsgId가 null이면 항상 새 행 insert.
     */
    async append(workspaceId: string, conversationId: string, input: AppendMessageInput) {
      await assertConversationOwned(db, workspaceId, conversationId);
      const values = {
        id: newId("msg"),
        conversationId,
        clientMsgId: input.clientMsgId ?? null,
        role: input.role,
        authorId: input.authorId ?? null,
        content: input.content,
      };

      if (input.clientMsgId) {
        const inserted = await db
          .insert(messages)
          .values(values)
          .onConflictDoNothing({ target: [messages.conversationId, messages.clientMsgId] })
          .returning();
        if (inserted[0]) return inserted[0];
        // 충돌 → 기존 행 반환
        const [existing] = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              eq(messages.clientMsgId, input.clientMsgId),
            ),
          );
        return existing!;
      }

      const [row] = await db.insert(messages).values(values).returning();
      return row!;
    },

    /** cursor 이후 메시지(동기화). (created_at, id) 오름차순. */
    async listAfter(
      workspaceId: string,
      conversationId: string,
      cursor?: Cursor,
      limit = 100,
    ) {
      await assertConversationOwned(db, workspaceId, conversationId);
      const conds = [eq(messages.conversationId, conversationId)];
      if (cursor) {
        conds.push(keysetCursorCondition(messages.createdAt, messages.id, cursor, "asc"));
      }
      return db
        .select()
        .from(messages)
        .where(and(...conds))
        .orderBy(asc(messages.createdAt), asc(messages.id))
        .limit(limit);
    },

    /** 대화의 마지막 메시지 1건(인박스 요약용). 없으면 undefined. */
    async getLast(workspaceId: string, conversationId: string) {
      await assertConversationOwned(db, workspaceId, conversationId);
      const [row] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);
      return row;
    },

    /** 최근 n개 — 최신 n개를 뽑되 오래된→최신 순으로 정렬해 반환. */
    async listRecent(workspaceId: string, conversationId: string, n = 50) {
      await assertConversationOwned(db, workspaceId, conversationId);
      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(n);
      return rows.reverse();
    },
  };
}

export type MessageRepo = ReturnType<typeof makeMessageRepo>;
