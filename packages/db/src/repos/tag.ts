/**
 * tagRepo — 인박스 태그 + 대화 부착. 03_DATA_MODEL.md §3.
 * 첫 인자 workspaceId(규칙 11). 대화↔태그 부착은 양쪽 모두 같은 워크스페이스 소유일 때만 허용
 * (교차 워크스페이스 부착 차단 — 보안 요구사항).
 */
import { newId } from "@aidetalk/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "../client";
import { isUniqueViolation } from "./_shared";
import { conversations } from "../schema/conversations";
import { conversationTags } from "../schema/conversation-tags";
import { tags } from "../schema/tags";

export interface CreateTagInput {
  name: string;
  color?: string; // 기본 'gray'
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export function makeTagRepo(db: Database) {
  /** 대화에 부착된 tagId 목록(부착 시간 오름차순). */
  async function listIdsByConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<string[]> {
    const rows = await db
      .select({ tagId: conversationTags.tagId })
      .from(conversationTags)
      .where(
        and(
          eq(conversationTags.workspaceId, workspaceId),
          eq(conversationTags.conversationId, conversationId),
        ),
      )
      .orderBy(asc(conversationTags.createdAt), asc(conversationTags.tagId));
    return rows.map((r) => r.tagId);
  }

  return {
    /** 워크스페이스 태그 목록 — name 오름차순, 상한 200. */
    async list(workspaceId: string) {
      return db
        .select()
        .from(tags)
        .where(eq(tags.workspaceId, workspaceId))
        .orderBy(asc(tags.name))
        .limit(200);
    },

    /**
     * 태그 생성. (workspace_id, name) 유니크 충돌이면 `null` 반환
     * (라우트가 conflict 에러로 매핑). 그 외 성공 시 생성 행 반환.
     */
    async create(workspaceId: string, input: CreateTagInput) {
      try {
        const [row] = await db
          .insert(tags)
          .values({
            id: newId("tag"),
            workspaceId,
            name: input.name,
            color: input.color ?? "gray",
          })
          .returning();
        return row!;
      } catch (err) {
        if (isUniqueViolation(err)) return null;
        throw err;
      }
    },

    /**
     * 태그 수정. 이름 충돌 시 `null`(create와 동일), 대상 없으면 `undefined`.
     * patch가 비어 있으면 현재 행을 그대로 반환.
     */
    async update(workspaceId: string, tagId: string, patch: UpdateTagInput) {
      const set: Record<string, unknown> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.color !== undefined) set.color = patch.color;
      if (Object.keys(set).length === 0) {
        const [row] = await db
          .select()
          .from(tags)
          .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, tagId)));
        return row;
      }
      try {
        const [row] = await db
          .update(tags)
          .set(set)
          .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, tagId)))
          .returning();
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) return null;
        throw err;
      }
    },

    /** 태그 삭제. conversation_tags는 FK cascade로 함께 정리. 삭제 성공 여부 반환. */
    async remove(workspaceId: string, tagId: string) {
      const rows = await db
        .delete(tags)
        .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, tagId)))
        .returning({ id: tags.id });
      return rows.length > 0;
    },

    /**
     * 대화에 태그 부착(멱등). 대화·태그가 모두 이 워크스페이스 소유일 때만 부착하고
     * 최종 tagId 목록을 반환. 소유 검증 실패(교차 워크스페이스) 시 `undefined`.
     */
    async addToConversation(
      workspaceId: string,
      conversationId: string,
      tagId: string,
    ): Promise<string[] | undefined> {
      const [conv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)));
      const [tag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.workspaceId, workspaceId), eq(tags.id, tagId)));
      if (!conv || !tag) return undefined;
      await db
        .insert(conversationTags)
        .values({ workspaceId, conversationId, tagId })
        .onConflictDoNothing({
          target: [conversationTags.conversationId, conversationTags.tagId],
        });
      return listIdsByConversation(workspaceId, conversationId);
    },

    /** 대화에서 태그 제거(멱등). 최종 tagId 목록 반환. */
    async removeFromConversation(
      workspaceId: string,
      conversationId: string,
      tagId: string,
    ): Promise<string[]> {
      await db
        .delete(conversationTags)
        .where(
          and(
            eq(conversationTags.workspaceId, workspaceId),
            eq(conversationTags.conversationId, conversationId),
            eq(conversationTags.tagId, tagId),
          ),
        );
      return listIdsByConversation(workspaceId, conversationId);
    },

    listIdsByConversation,

    /**
     * 여러 대화의 tagId 목록을 한 번에 조회(목록 화면 배치 — N+1 방지).
     * 반환: conversationId → tagId[] (부착 시간 오름차순). 태그 없는 대화는 키 없음.
     */
    async mapIdsByConversations(
      workspaceId: string,
      conversationIds: string[],
    ): Promise<Map<string, string[]>> {
      const map = new Map<string, string[]>();
      if (conversationIds.length === 0) return map;
      const rows = await db
        .select({
          conversationId: conversationTags.conversationId,
          tagId: conversationTags.tagId,
        })
        .from(conversationTags)
        .where(
          and(
            eq(conversationTags.workspaceId, workspaceId),
            inArray(conversationTags.conversationId, conversationIds),
          ),
        )
        .orderBy(asc(conversationTags.createdAt), asc(conversationTags.tagId));
      for (const r of rows) {
        const arr = map.get(r.conversationId);
        if (arr) arr.push(r.tagId);
        else map.set(r.conversationId, [r.tagId]);
      }
      return map;
    },
  };
}

export type TagRepo = ReturnType<typeof makeTagRepo>;
