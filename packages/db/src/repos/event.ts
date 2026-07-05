/**
 * eventRepo — conversation_events. 03_DATA_MODEL.md §3.
 * 대화 소유 검증을 내부에서 수행.
 */
import type { EventType } from "@aidetalk/shared";
import { newId } from "@aidetalk/shared";
import { asc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { conversationEvents, type ConversationEventPayload } from "../schema/conversation-events";
import { assertConversationOwned } from "./_shared";

export interface AppendEventInput {
  type: EventType;
  actor: string; // 'system' | 'agent:{id}' | 'user:{id}' | 'visitor:{id}'
  payload?: ConversationEventPayload;
}

export function makeEventRepo(db: Database) {
  return {
    async append(workspaceId: string, conversationId: string, input: AppendEventInput) {
      await assertConversationOwned(db, workspaceId, conversationId);
      const [row] = await db
        .insert(conversationEvents)
        .values({
          id: newId("evt"),
          conversationId,
          type: input.type,
          actor: input.actor,
          payload: input.payload ?? {},
        })
        .returning();
      return row!;
    },

    async listByConversation(workspaceId: string, conversationId: string) {
      await assertConversationOwned(db, workspaceId, conversationId);
      return db
        .select()
        .from(conversationEvents)
        .where(eq(conversationEvents.conversationId, conversationId))
        .orderBy(asc(conversationEvents.createdAt), asc(conversationEvents.id));
    },
  };
}

export type EventRepo = ReturnType<typeof makeEventRepo>;
