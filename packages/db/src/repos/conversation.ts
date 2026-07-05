/**
 * conversationRepo — 03_DATA_MODEL.md §3.
 */
import { newId } from "@aidetalk/shared";
import { and, between, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../client";
import { conversations, type ConversationMetadata } from "../schema/conversations";
import { messages } from "../schema/messages";
import type { Cursor } from "./_context";
import { keysetCursorCondition } from "./_shared";

export interface CreateConversationInput {
  visitorId: string;
  mode?: "ai" | "human"; // agent 미등록 워크스페이스는 'human'으로 시작
  status?: "open" | "pending" | "closed";
  metadata?: ConversationMetadata;
}

export interface ListInboxParams {
  status?: "open" | "pending" | "closed";
  cursor?: Cursor; // 이 커서보다 오래된(lastMessageAt 기준) 항목
  limit?: number; // 기본 30
  q?: string; // messages.content->>'text' ILIKE 단순 검색(v1)
}

export function makeConversationRepo(db: Database) {
  return {
    async create(workspaceId: string, input: CreateConversationInput) {
      const now = new Date();
      const [row] = await db
        .insert(conversations)
        .values({
          id: newId("conv"),
          workspaceId,
          visitorId: input.visitorId,
          status: input.status ?? "open",
          mode: input.mode ?? "ai",
          metadata: input.metadata ?? {},
          lastMessageAt: now,
        })
        .returning();
      return row!;
    },

    async getById(workspaceId: string, conversationId: string) {
      const [row] = await db
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
        );
      return row;
    },

    /** 인박스 목록 — lastMessageAt desc 키셋. status 필터 선택. */
    async listForInbox(workspaceId: string, params: ListInboxParams = {}) {
      const limit = params.limit ?? 30;
      const conds = [eq(conversations.workspaceId, workspaceId)];
      if (params.status) conds.push(eq(conversations.status, params.status));
      if (params.q) {
        // 메시지 본문 ILIKE 검색 — 대화별 EXISTS 상관 서브쿼리(v1 단순 검색).
        const like = `%${params.q}%`;
        conds.push(
          sql`EXISTS (SELECT 1 FROM ${messages} WHERE ${messages.conversationId} = ${conversations.id} AND ${messages.content}->>'text' ILIKE ${like})`,
        );
      }
      if (params.cursor) {
        // (lastMessageAt, id) < (cursor.createdAt, cursor.id) — desc 페이지네이션
        conds.push(
          keysetCursorCondition(conversations.lastMessageAt, conversations.id, params.cursor, "desc"),
        );
      }
      return db
        .select()
        .from(conversations)
        .where(and(...conds))
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(limit);
    },

    /**
     * 이 방문자의 가장 최근 open 대화(세션 복원 시 openConversationId 계산용).
     * 없으면 undefined. 04 §1 POST /v1/widget/session.
     */
    async getLatestOpenByVisitor(workspaceId: string, visitorId: string) {
      const [row] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.workspaceId, workspaceId),
            eq(conversations.visitorId, visitorId),
            eq(conversations.status, "open"),
          ),
        )
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(1);
      return row;
    },

    /** mode 전환(핸드오프). assigneeId는 human 전환 시 담당자. */
    async setMode(
      workspaceId: string,
      conversationId: string,
      mode: "ai" | "human",
      assigneeId?: string | null,
    ) {
      const patch: Record<string, unknown> = { mode, updatedAt: new Date() };
      if (assigneeId !== undefined) patch.assigneeId = assigneeId;
      const [row] = await db
        .update(conversations)
        .set(patch)
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
        )
        .returning();
      return row;
    },

    async assign(workspaceId: string, conversationId: string, assigneeId: string | null) {
      const [row] = await db
        .update(conversations)
        .set({ assigneeId, updatedAt: new Date() })
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
        )
        .returning();
      return row;
    },

    async setStatus(
      workspaceId: string,
      conversationId: string,
      status: "open" | "pending" | "closed",
    ) {
      const [row] = await db
        .update(conversations)
        .set({ status, updatedAt: new Date() })
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
        )
        .returning();
      return row;
    },

    /** 기간 내 생성된 대화 수 — 트래킹 요약 카드 "총 대화"(04 §2). */
    async countCreatedInPeriod(workspaceId: string, from: Date, to: Date) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversations)
        .where(
          and(eq(conversations.workspaceId, workspaceId), between(conversations.createdAt, from, to)),
        );
      return row?.count ?? 0;
    },

    /**
     * 읽음 표시 갱신(read receipts) — by 주체가 읽은 마지막 메시지 id를 기록.
     * 04 §5.1/§5.3 read.mark 처리의 저장 지점. 갱신된 대화 행 반환(없으면 undefined).
     */
    async setReadMarker(
      workspaceId: string,
      conversationId: string,
      by: "visitor" | "agent",
      lastMessageId: string,
    ) {
      const patch =
        by === "visitor"
          ? { visitorLastReadMessageId: lastMessageId }
          : { agentLastReadMessageId: lastMessageId };
      const [row] = await db
        .update(conversations)
        .set({ ...patch, updatedAt: new Date() })
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
        )
        .returning();
      return row;
    },

    async touchLastMessage(workspaceId: string, conversationId: string, at: Date = new Date()) {
      const [row] = await db
        .update(conversations)
        .set({ lastMessageAt: at, updatedAt: new Date() })
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
        )
        .returning();
      return row;
    },
  };
}

export type ConversationRepo = ReturnType<typeof makeConversationRepo>;
