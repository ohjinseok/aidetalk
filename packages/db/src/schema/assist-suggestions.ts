/**
 * assist_suggestions — 상담 어시스트 제안(상담원 전용). 03_DATA_MODEL.md §2.
 * ⚠️ CLAUDE.md 절대 규칙 9: visitor 자격으로 절대 조회 불가.
 *    repo 함수 시그니처에 memberContext 필수 (09 테스트 필수 커버리지).
 */
import type { Suggestion } from "@aidetalk/shared";
import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";

// shared는 개별 타입을 내보내지 않으므로 Suggestion에서 파생(추가 export 없이 재사용).
type SuggestionSource = Suggestion["source"];
type SuggestionOutcome = Suggestion["outcome"];
type SuggestionAction = NonNullable<Suggestion["actions"]>[number];

export const assistSuggestions = pgTable(
  "assist_suggestions",
  {
    id: text("id").primaryKey(), // asg_
    workspaceId: text("workspace_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    triggerMessageId: text("trigger_message_id").notNull(),
    draft: text("draft").notNull(),
    rationale: text("rationale"),
    actions: jsonb("actions").$type<SuggestionAction[]>(), // [{ label, url }]
    source: text("source").$type<SuggestionSource>().notNull().default("agent"), // 'agent' | 'builtin'(Could)
    outcome: text("outcome").$type<SuggestionOutcome>().notNull().default("pending"), // 'pending'|'accepted'|'edited'|'ignored'
    createdAt: createdAt(),
  },
  (t) => [index("asg_conv").on(t.conversationId, t.createdAt)],
);
