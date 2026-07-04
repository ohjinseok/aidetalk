/**
 * conversions — 전환 이벤트(매출/행동 공용). 03_DATA_MODEL.md §2.
 * 귀속 규칙은 workspaces.attribution_rule, 조회 시 계산. 원본 이벤트는 그대로 보존.
 */
import { pgTable, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";

export const conversions = pgTable(
  "conversions",
  {
    id: text("id").primaryKey(), // cvn_
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    trackedLinkId: text("tracked_link_id"), // 있으면 어떤 링크에서 비롯됐는지
    source: text("source").notNull(), // 'click_only' | 'pixel' | 'commerce_api' | 'booking'(v1.5 S2)
    amount: integer("amount"), // 원 단위. 예약형 등은 null
    currency: text("currency").notNull().default("KRW"),
    externalRef: text("external_ref"), // 주문번호 등. 멱등키
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("cvn_dedupe").on(t.workspaceId, t.externalRef)],
);
