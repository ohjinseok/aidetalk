/**
 * tags — 인박스 태그(워크스페이스 스코프). 03_DATA_MODEL.md §2.
 * (workspace_id, name) 유니크 — 같은 워크스페이스 내 이름 중복 금지.
 */
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { workspaces } from "./workspaces";

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(), // tag_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("gray"), // 대시보드 색상 토큰 키
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_ws_name").on(t.workspaceId, t.name)],
);
