/**
 * agentLogRepo — agent_logs. 03_DATA_MODEL.md §3.
 * agent_logs에는 workspace_id 컬럼이 없으므로 agent 소유로 격리(agentId → workspace).
 */
import { AppError, newId } from "@aidetalk/shared";
import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../client";
import { agentLogs, type AgentLogRequestSummary, type AgentLogResponseSummary } from "../schema/agent-logs";
import { agents } from "../schema/agents";
import type { Cursor } from "./_context";
import { keysetCursorCondition } from "./_shared";

export interface AppendAgentLogInput {
  agentId: string;
  conversationId: string;
  messageId?: string | null;
  mode: "reply" | "assist";
  requestSummary: AgentLogRequestSummary;
  responseSummary?: AgentLogResponseSummary | null;
  outcome: "reply" | "handoff" | "noop" | "suggest" | "timeout" | "error";
}

export function makeAgentLogRepo(db: Database) {
  /** agentId가 워크스페이스 소유인지 확인. */
  async function assertAgentOwned(workspaceId: string, agentId: string) {
    const [row] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)));
    return row !== undefined;
  }

  return {
    async append(workspaceId: string, input: AppendAgentLogInput) {
      // 소유 검증 실패 시 not_found로 격리(존재 자체를 숨긴다 — message/event repo와 대칭).
      if (!(await assertAgentOwned(workspaceId, input.agentId))) {
        throw AppError.of("not_found", "에이전트를 찾을 수 없다.");
      }
      const [row] = await db
        .insert(agentLogs)
        .values({
          id: newId("alg"),
          agentId: input.agentId,
          conversationId: input.conversationId,
          messageId: input.messageId ?? null,
          mode: input.mode,
          requestSummary: input.requestSummary,
          responseSummary: input.responseSummary ?? null,
          outcome: input.outcome,
        })
        .returning();
      return row!;
    },

    async listByAgent(workspaceId: string, agentId: string, cursor?: Cursor, limit = 50) {
      if (!(await assertAgentOwned(workspaceId, agentId))) return [];
      const conds = [eq(agentLogs.agentId, agentId)];
      if (cursor) {
        conds.push(keysetCursorCondition(agentLogs.createdAt, agentLogs.id, cursor, "desc"));
      }
      return db
        .select()
        .from(agentLogs)
        .where(and(...conds))
        .orderBy(desc(agentLogs.createdAt), desc(agentLogs.id))
        .limit(limit);
    },
  };
}

export type AgentLogRepo = ReturnType<typeof makeAgentLogRepo>;
