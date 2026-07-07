/**
 * conversationRepo — 03_DATA_MODEL.md §3.
 */
import { newId } from "@aidetalk/shared";
import type { SQL } from "drizzle-orm";
import {
  and,
  between,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";

import type { Database } from "../client";
import { conversations, type ConversationMetadata } from "../schema/conversations";
import { conversationFavorites } from "../schema/conversation-favorites";
import { conversationTags } from "../schema/conversation-tags";
import { messages } from "../schema/messages";
import type { Cursor } from "./_context";
import { keysetCursorCondition } from "./_shared";

/**
 * 대화별 "안읽음" = visitor가 보냈고 agent가 아직 안 읽은 메시지.
 * agent_last_read_message_id가 null이면 전부 안읽음, 아니면 그 메시지의 created_at 이후만.
 * (msg_ nanoid는 단조가 아니므로 id가 아니라 created_at으로 비교 — conversations 스키마 주석 참조.)
 */
function unreadCountExpr(): SQL<number> {
  return sql<number>`(SELECT count(*)::int FROM ${messages} m
    WHERE m.conversation_id = ${conversations.id} AND m.role = 'visitor'
      AND (${conversations.agentLastReadMessageId} IS NULL
           OR m.created_at > (SELECT m2.created_at FROM ${messages} m2 WHERE m2.id = ${conversations.agentLastReadMessageId})))`;
}

/** 위 안읽음이 하나라도 있는지의 EXISTS 조건(unreadOnly 필터·unread 카운트용). */
function unreadExistsCond(): SQL {
  return sql`EXISTS (SELECT 1 FROM ${messages} m
    WHERE m.conversation_id = ${conversations.id} AND m.role = 'visitor'
      AND (${conversations.agentLastReadMessageId} IS NULL
           OR m.created_at > (SELECT m2.created_at FROM ${messages} m2 WHERE m2.id = ${conversations.agentLastReadMessageId})))`;
}

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
  // 담당자 필터: 특정 상담원 담당 | 미배정. 미지정이면 전체.
  assignee?: { kind: "user"; userId: string } | { kind: "none" };
  tagId?: string; // 이 태그가 부착된 대화만(conversation_tags EXISTS)
  unreadOnly?: boolean; // 안읽음(visitor 미열람)이 있는 대화만
  favoriteOf?: string; // 이 상담원(userId)이 즐겨찾기한 대화만(conversation_favorites EXISTS)
}

/** 인박스 카운트 배지(04 §2) — 모수는 status != 'closed'. */
export interface InboxCounts {
  mine: number;
  all: number;
  unread: number;
  favorites: number;
  unassigned: number;
  byAssignee: { assigneeId: string; count: number }[];
  byTag: { tagId: string; count: number }[];
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

    /**
     * 인박스 목록 — lastMessageAt desc 키셋. 각 행에 안읽음 수(unread) 포함.
     * status/assignee/tagId/unreadOnly/favoriteOf/q 필터 조합 가능.
     */
    async listForInbox(workspaceId: string, params: ListInboxParams = {}) {
      const limit = params.limit ?? 30;
      const conds = [eq(conversations.workspaceId, workspaceId)];
      if (params.status) conds.push(eq(conversations.status, params.status));
      if (params.assignee) {
        conds.push(
          params.assignee.kind === "none"
            ? isNull(conversations.assigneeId)
            : eq(conversations.assigneeId, params.assignee.userId),
        );
      }
      if (params.tagId) {
        conds.push(
          sql`EXISTS (SELECT 1 FROM ${conversationTags} ct WHERE ct.conversation_id = ${conversations.id} AND ct.tag_id = ${params.tagId} AND ct.workspace_id = ${workspaceId})`,
        );
      }
      if (params.favoriteOf) {
        conds.push(
          sql`EXISTS (SELECT 1 FROM ${conversationFavorites} cf WHERE cf.conversation_id = ${conversations.id} AND cf.user_id = ${params.favoriteOf} AND cf.workspace_id = ${workspaceId})`,
        );
      }
      if (params.unreadOnly) conds.push(unreadExistsCond());
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
        .select({ ...getTableColumns(conversations), unread: unreadCountExpr() })
        .from(conversations)
        .where(and(...conds))
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(limit);
    },

    /** 이 방문자의 다른 상담(방문자 프로필 패널). lastMessageAt desc, 기본 10건. */
    async listByVisitor(workspaceId: string, visitorId: string, limit = 10) {
      return db
        .select()
        .from(conversations)
        .where(
          and(eq(conversations.workspaceId, workspaceId), eq(conversations.visitorId, visitorId)),
        )
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(limit);
    },

    /**
     * 인박스 카운트 배지 — 모수는 status != 'closed'. 쿼리 3개(집계 + 담당자 GROUP BY + 태그 GROUP BY).
     * mine/unassigned/favorites/unread는 상관 필터로 한 번에, byAssignee/byTag는 GROUP BY로.
     */
    async countsForInbox(workspaceId: string, userId: string): Promise<InboxCounts> {
      const notClosed = and(
        eq(conversations.workspaceId, workspaceId),
        ne(conversations.status, "closed"),
      );

      const [agg] = await db
        .select({
          all: sql<number>`count(*)::int`,
          mine: sql<number>`(count(*) filter (where ${conversations.assigneeId} = ${userId}))::int`,
          unassigned: sql<number>`(count(*) filter (where ${conversations.assigneeId} is null))::int`,
          unread: sql<number>`(count(*) filter (where ${unreadExistsCond()}))::int`,
          favorites: sql<number>`(count(*) filter (where EXISTS (SELECT 1 FROM ${conversationFavorites} cf WHERE cf.conversation_id = ${conversations.id} AND cf.user_id = ${userId} AND cf.workspace_id = ${workspaceId})))::int`,
        })
        .from(conversations)
        .where(notClosed);

      const byAssigneeRows = await db
        .select({
          assigneeId: conversations.assigneeId,
          count: sql<number>`count(*)::int`,
        })
        .from(conversations)
        .where(and(notClosed, isNotNull(conversations.assigneeId)))
        .groupBy(conversations.assigneeId);

      const byTagRows = await db
        .select({
          tagId: conversationTags.tagId,
          count: sql<number>`count(*)::int`,
        })
        .from(conversationTags)
        .innerJoin(conversations, eq(conversations.id, conversationTags.conversationId))
        .where(and(eq(conversationTags.workspaceId, workspaceId), ne(conversations.status, "closed")))
        .groupBy(conversationTags.tagId);

      return {
        mine: agg?.mine ?? 0,
        all: agg?.all ?? 0,
        unread: agg?.unread ?? 0,
        favorites: agg?.favorites ?? 0,
        unassigned: agg?.unassigned ?? 0,
        byAssignee: byAssigneeRows.map((r) => ({ assigneeId: r.assigneeId!, count: r.count })),
        byTag: byTagRows.map((r) => ({ tagId: r.tagId, count: r.count })),
      };
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
