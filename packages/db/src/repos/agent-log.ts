/**
 * agentLogRepo — agent_logs. 03_DATA_MODEL.md §3.
 * agent_logs에는 workspace_id 컬럼이 없으므로 agent 소유로 격리(agentId → workspace).
 * purgeOlderThan은 ee의 로그 보존 배치가 워크스페이스별 보존일수로 호출(10 §4).
 */
import { newId } from "@aidetalk/shared";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";

import type { Database } from "../client";
import { agentLogs, type AgentLogRequestSummary, type AgentLogResponseSummary } from "../schema/agent-logs";
import { agents } from "../schema/agents";
import type { Cursor } from "./_context";

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
      await assertAgentOwned(workspaceId, input.agentId);
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
        const cursorAt = new Date(cursor.createdAt);
        conds.push(
          or(
            lt(agentLogs.createdAt, cursorAt),
            and(eq(agentLogs.createdAt, cursorAt), lt(agentLogs.id, cursor.id)),
          )!,
        );
      }
      return db
        .select()
        .from(agentLogs)
        .where(and(...conds))
        .orderBy(desc(agentLogs.createdAt), desc(agentLogs.id))
        .limit(limit);
    },

    /** 보존일 초과 로그 삭제(워크스페이스의 모든 agent 대상). days=Infinity면 no-op. */
    async purgeOlderThan(workspaceId: string, days: number) {
      if (!Number.isFinite(days)) return 0;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const agentIds = (
        await db.select({ id: agents.id }).from(agents).where(eq(agents.workspaceId, workspaceId))
      ).map((r) => r.id);
      if (agentIds.length === 0) return 0;
      const deleted = await db
        .delete(agentLogs)
        .where(and(inArray(agentLogs.agentId, agentIds), lt(agentLogs.createdAt, cutoff)))
        .returning({ id: agentLogs.id });
      return deleted.length;
    },
  };
}

export type AgentLogRepo = ReturnType<typeof makeAgentLogRepo>;
