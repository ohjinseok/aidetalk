/**
 * agentRepo — 03_DATA_MODEL.md §3.
 * secret 원문은 저장하지 않고 sha256 해시만 저장(규칙 5).
 * workspace당 status=active agent 최대 1개(코드 레벨 제약) — create/setStatus에서 강제.
 */
import { newId } from "@aidetalk/shared";
import { AppError } from "@aidetalk/shared";
import { and, asc, eq, ne } from "drizzle-orm";

import type { Database } from "../client";
import { hashSecret } from "../crypto";
import { agents } from "../schema/agents";

export interface CreateAgentInput {
  name: string;
  endpointUrl: string;
  secret: string; // 평문 — repo가 sha256 해시화. 원문은 호출측이 1회 노출 후 폐기.
  secretEnc: string; // 서명용 원문의 AES-GCM 암호문(호출측이 SESSION_SECRET 파생키로 생성).
  timeoutMs?: number;
  assistEnabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  endpointUrl?: string;
  timeoutMs?: number;
  assistEnabled?: boolean;
}

export type AgentStatus = "active" | "disabled" | "auto_disabled";

export function makeAgentRepo(db: Database) {
  /** 워크스페이스에 이미 active agent가 있으면 conflict. */
  async function assertNoOtherActive(workspaceId: string, exceptId?: string) {
    const conds = [eq(agents.workspaceId, workspaceId), eq(agents.status, "active")];
    if (exceptId) conds.push(ne(agents.id, exceptId));
    const existing = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(...conds));
    if (existing.length > 0) {
      throw AppError.of("conflict", "이미 활성화된 에이전트가 있다(워크스페이스당 1개).");
    }
  }

  return {
    /** 커넥터 등록. 기본 status=active → 기존 active와 충돌 시 conflict. */
    async create(workspaceId: string, input: CreateAgentInput) {
      await assertNoOtherActive(workspaceId);
      const [row] = await db
        .insert(agents)
        .values({
          id: newId("agt"),
          workspaceId,
          name: input.name,
          endpointUrl: input.endpointUrl,
          secretHash: hashSecret(input.secret),
          secretEnc: input.secretEnc,
          status: "active",
          timeoutMs: input.timeoutMs ?? 30000,
          assistEnabled: input.assistEnabled ?? true,
        })
        .returning();
      return row!;
    },

    async update(workspaceId: string, agentId: string, patch: UpdateAgentInput) {
      const [row] = await db
        .update(agents)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
        .returning();
      return row;
    },

    /** secret 재발급 — 새 해시+암호문 저장, 평문은 호출측이 1회 노출. */
    async rotateSecret(
      workspaceId: string,
      agentId: string,
      newSecret: string,
      newSecretEnc: string,
    ) {
      const [row] = await db
        .update(agents)
        .set({
          secretHash: hashSecret(newSecret),
          secretEnc: newSecretEnc,
          updatedAt: new Date(),
        })
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
        .returning();
      return row;
    },

    async setStatus(workspaceId: string, agentId: string, status: AgentStatus) {
      if (status === "active") await assertNoOtherActive(workspaceId, agentId);
      const [row] = await db
        .update(agents)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
        .returning();
      return row;
    },

    /** reply 연속 실패 카운트 +1. auto_disable 임계 판단은 dispatcher(서버) 책임. */
    async bumpFailure(workspaceId: string, agentId: string) {
      const [current] = await db
        .select({ failureCount: agents.failureCount })
        .from(agents)
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)));
      if (!current) return undefined;
      const [row] = await db
        .update(agents)
        .set({ failureCount: current.failureCount + 1, updatedAt: new Date() })
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
        .returning();
      return row;
    },

    /** 성공 시 실패 카운트 리셋. */
    async resetFailure(workspaceId: string, agentId: string) {
      const [row] = await db
        .update(agents)
        .set({ failureCount: 0, updatedAt: new Date() })
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)))
        .returning();
      return row;
    },

    /** 워크스페이스의 단일 active agent(라우팅 대상). 없으면 undefined. */
    async getActive(workspaceId: string) {
      const [row] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.status, "active")));
      return row;
    },

    async getById(workspaceId: string, agentId: string) {
      const [row] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)));
      return row;
    },

    /** 워크스페이스의 모든 커넥터(생성순). GET /v1/workspaces/:wsId/agents. */
    async list(workspaceId: string) {
      return db
        .select()
        .from(agents)
        .where(eq(agents.workspaceId, workspaceId))
        .orderBy(asc(agents.createdAt), asc(agents.id));
    },
  };
}

export type AgentRepo = ReturnType<typeof makeAgentRepo>;
