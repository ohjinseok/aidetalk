/**
 * conversation_favorites — 상담원 개인별 즐겨찾기. 03_DATA_MODEL.md §2.
 * PK (conversation_id, user_id) — 상담원 한 명이 대화를 최대 한 번만 즐겨찾기.
 * user_id는 전역 users.id 참조(값 스코프는 workspace_id로 격리) — assigneeId와 동일하게 FK는 걸지 않는다.
 */
import { pgTable, text, index, primaryKey } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { conversations } from "./conversations";
import { workspaces } from "./workspaces";

export const conversationFavorites = pgTable(
  "conversation_favorites",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    userId: text("user_id").notNull(), // users.id (상담원)
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    // "내 즐겨찾기" 목록/카운트(favoriteOf, filterFavoriteIds)용.
    index("conv_favs_ws_user").on(t.workspaceId, t.userId),
  ],
);
