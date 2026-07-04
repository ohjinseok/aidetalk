/**
 * agent_logs — AI observability. 03_DATA_MODEL.md §2.
 * 보존: 셀프호스팅 무제한 / 클라우드는 PlanEnforcer.getLogRetentionDays 기반 일배치 삭제(ee).
 */
import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";

import { createdAt } from "./_helpers";
import { agents } from "./agents";

/** request 요약 jsonb — history 본문 제외 { messageText: 앞200자, historyCount }. */
export type AgentLogRequestSummary = Record<string, unknown>;
/** response 요약 jsonb — { type, textPreview: 앞500자, latencyMs, httpStatus }. */
export type AgentLogResponseSummary = Record<string, unknown>;

export const agentLogs = pgTable(
  "agent_logs",
  {
    id: text("id").primaryKey(), // alg_
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id"), // 트리거된 손님 메시지
    mode: text("mode").notNull(), // 'reply' | 'assist'
    requestSummary: jsonb("request_summary").$type<AgentLogRequestSummary>().notNull(),
    responseSummary: jsonb("response_summary").$type<AgentLogResponseSummary>(),
    outcome: text("outcome").notNull(), // 'reply'|'handoff'|'noop'|'suggest'|'timeout'|'error'
    createdAt: createdAt(),
  },
  (t) => [index("alog_agent").on(t.agentId, t.createdAt)],
);
