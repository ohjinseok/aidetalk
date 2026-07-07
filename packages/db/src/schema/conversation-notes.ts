/**
 * conversation_notes — 대화 내부 메모(상담원 전용, 손님 미노출). 03_DATA_MODEL.md §2.
 * author_id는 전역 users.id 참조(값 스코프는 workspace_id로 격리) — assigneeId와 동일하게 FK는 걸지 않는다.
 */
import { pgTable, text, index } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_helpers";
import { conversations } from "./conversations";
import { workspaces } from "./workspaces";

export const conversationNotes = pgTable(
  "conversation_notes",
  {
    id: text("id").primaryKey(), // note_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    authorId: text("author_id").notNull(), // users.id (작성 상담원)
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // 대화별 메모 시간순 조회용.
  (t) => [index("conv_notes_conv_created").on(t.conversationId, t.createdAt)],
);
