/**
 * conversation_events — 대화 감사 추적. 03_DATA_MODEL.md §2.
 */
import type { EventType } from "@aidetalk/shared";
import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { conversations } from "./conversations";

/** 이벤트 payload jsonb — handoff면 { reason, summary }. */
export type ConversationEventPayload = Record<string, unknown>;

export const conversationEvents = pgTable(
  "conversation_events",
  {
    id: text("id").primaryKey(), // evt_
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    // 'handoff_auto' | 'handoff_agent' | 'handoff_requested' | 'returned_to_ai'
    // | 'assigned' | 'unassigned' | 'closed' | 'reopened'
    type: text("type").$type<EventType>().notNull(),
    // 'system' | 'agent:{agt_id}' | 'user:{usr_id}' | 'visitor:{vis_id}'
    actor: text("actor").notNull(),
    payload: jsonb("payload").$type<ConversationEventPayload>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("evt_conv").on(t.conversationId, t.createdAt)],
);
