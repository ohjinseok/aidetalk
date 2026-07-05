/**
 * workspaces — 테넌트 루트. 03_DATA_MODEL.md §2.
 */
import type { WidgetSettings } from "@aidetalk/shared";
import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_helpers";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(), // ws_
  name: text("name").notNull(),
  // 's1_site' | 's2_no_site' — 기능 노출 분기
  segment: text("segment").notNull().default("s1_site"),
  // 'oss' | 'starter' | 'pro' (셀프호스팅은 항상 oss)
  plan: text("plan").notNull().default("oss"),
  widgetSettings: jsonb("widget_settings").$type<WidgetSettings>().notNull().default({}),
  // 'last_click' | 'first_click'
  attributionRule: text("attribution_rule").notNull().default("last_click"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
