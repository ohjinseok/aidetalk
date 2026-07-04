/**
 * messages — 대화 메시지. 03_DATA_MODEL.md §2.
 * 순서 보장: ORDER BY created_at, id. 클라이언트는 서버 타임스탬프만 신뢰.
 */
import type { MessageContent } from "@aidetalk/shared";
import { pgTable, text, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

import { conversations } from "./conversations";

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(), // msg_ (nanoid는 단조 아님 → 정렬은 created_at, id 보조키)
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    clientMsgId: text("client_msg_id"), // 위젯 임시 ID
    role: text("role").notNull(), // 'visitor' | 'agent_ai' | 'agent_human' | 'system'
    authorId: text("author_id"), // role별 visitor/user/agent id, system은 null
    content: jsonb("content").$type<MessageContent>().notNull(), // { type:"text", text, quickReplies?: string[] }
    // ⚠️ 밀리초 정밀도(precision 3): JS Date·커서와 정밀도를 일치시켜
    //   (created_at, id) 키셋 페이지네이션이 마이크로초 잔차로 중복/누락되지 않게 한다.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 중복 제거. clientMsgId null 행은 unique 미적용(Postgres 기본 동작).
    uniqueIndex("msg_dedupe").on(t.conversationId, t.clientMsgId),
    index("msg_order").on(t.conversationId, t.createdAt),
  ],
);
