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
  // 서명용 원문의 AES-GCM 암호문(agents.secretEnc와 동일 패턴) — 아웃바운드 HMAC 서명 시에만 복호화.
  secretEnc: text("secret_enc"),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});
