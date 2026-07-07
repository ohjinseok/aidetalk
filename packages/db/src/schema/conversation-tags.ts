/**
 * conversation_tags — 대화↔태그 다대다 조인. 03_DATA_MODEL.md §2.
 * PK (conversation_id, tag_id)로 중복 부착을 막고, tag 삭제 시 부착도 함께 정리(FK cascade).
 */
import { pgTable, text, index, primaryKey } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { conversations } from "./conversations";
import { tags } from "./tags";
import { workspaces } from "./workspaces";

export const conversationTags = pgTable(
  "conversation_tags",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.tagId] }),
    // 태그별 대화 카운트/필터(byTag 집계, tagId EXISTS)용.
    index("conv_tags_ws_tag").on(t.workspaceId, t.tagId),
  ],
);
