/**
 * conversationRepo — 03_DATA_MODEL.md §3.
 */
import { newId } from "@aidetalk/shared";
import { and, desc, eq, lt, or } from "drizzle-orm";

import type { Database } from "../client";
import { conversations, type ConversationMetadata } from "../schema/conversations";
import type { Cursor } from "./_context";

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
      if (params.cursor) {
        // (lastMessageAt, id) < (cursor.createdAt, cursor.id) — desc 페이지네이션
        const cursorAt = new Date(params.cursor.createdAt);
        conds.push(
          or(
            lt(conversations.lastMessageAt, cursorAt),
            and(
              eq(conversations.lastMessageAt, cursorAt),
              lt(conversations.id, params.cursor.id),
            ),
          )!,
        );
      }
      return db
        .select()
        .from(conversations)
        .where(and(...conds))
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(limit);
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
