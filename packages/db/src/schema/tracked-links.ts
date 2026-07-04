/**
 * tracked_links — 전환 트래킹 링크(S1). 03_DATA_MODEL.md §2.
 */
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";

export const trackedLinks = pgTable(
  "tracked_links",
  {
    id: text("id").primaryKey(), // tlk_
    token: text("token").notNull().unique(), // URL 파라미터 at_l 값 (짧은 nanoid 10)
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    messageId: text("message_id"), // 링크가 담겨 나간 메시지
    targetUrl: text("target_url").notNull(), // 원본 링크
    clickedAt: timestamp("clicked_at", { withTimezone: true }), // 미클릭 null
    createdAt: createdAt(),
  },
  (t) => [index("tlk_conv").on(t.conversationId)],
);
