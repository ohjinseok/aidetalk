/**
 * visitors — 위젯 방문자. 03_DATA_MODEL.md §2.
 */
import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { workspaces } from "./workspaces";

/** 유저 정의 속성 jsonb — { "주문번호": "...", "등급": "VIP" }. */
export type VisitorAttributes = Record<string, unknown>;

export const visitors = pgTable(
  "visitors",
  {
    id: text("id").primaryKey(), // vis_
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email"),
    name: text("name"),
    phone: text("phone"),
    attributes: jsonb("attributes").$type<VisitorAttributes>().notNull().default({}),
    firstReferrer: text("first_referrer"), // discovery 대비 유입 기록 (PRD §9.5)
    firstPageUrl: text("first_page_url"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    mergedInto: text("merged_into"), // self FK. 이메일 병합 시 원본 보존
    createdAt: createdAt(),
  },
  (t) => [index("visitors_ws_email").on(t.workspaceId, t.email)],
);
