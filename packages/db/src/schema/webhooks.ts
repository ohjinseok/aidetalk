/**
 * webhooks — 아웃바운드 웹훅(Should). 03_DATA_MODEL.md §2.
 */
import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";

/** 구독 이벤트 목록 — ["conversation.created","conversation.closed"]. */
export type WebhookEvents = string[];

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(), // whk_
  workspaceId: text("workspace_id").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").$type<WebhookEvents>().notNull(),
  secretHash: text("secret_hash").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});
