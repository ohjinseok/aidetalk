/**
 * favoriteRepo — 상담원 개인별 대화 즐겨찾기. 03_DATA_MODEL.md §3.
 * 첫 인자 workspaceId(규칙 11). 부착은 대화가 이 워크스페이스 소유일 때만.
 */
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../client";
import { conversations } from "../schema/conversations";
import { conversationFavorites } from "../schema/conversation-favorites";

export function makeFavoriteRepo(db: Database) {
  return {
    /**
     * 즐겨찾기 설정(멱등). 대화가 이 워크스페이스 소유일 때만 설정하고 true,
     * 소유 검증 실패 시 false.
     */
    async set(workspaceId: string, conversationId: string, userId: string) {
      const [conv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)));
      if (!conv) return false;
      await db
        .insert(conversationFavorites)
        .values({ workspaceId, conversationId, userId })
        .onConflictDoNothing({
          target: [conversationFavorites.conversationId, conversationFavorites.userId],
        });
      return true;
    },

    /** 즐겨찾기 해제(멱등). */
    async unset(workspaceId: string, conversationId: string, userId: string) {
      await db
        .delete(conversationFavorites)
        .where(
          and(
            eq(conversationFavorites.workspaceId, workspaceId),
            eq(conversationFavorites.conversationId, conversationId),
            eq(conversationFavorites.userId, userId),
          ),
        );
    },

    /** 이 상담원이 즐겨찾기했는지 여부. */
    async isFavorite(workspaceId: string, conversationId: string, userId: string) {
      const [row] = await db
        .select({ conversationId: conversationFavorites.conversationId })
        .from(conversationFavorites)
        .where(
          and(
            eq(conversationFavorites.workspaceId, workspaceId),
            eq(conversationFavorites.conversationId, conversationId),
            eq(conversationFavorites.userId, userId),
          ),
        );
      return !!row;
    },

    /**
     * 주어진 대화들 중 이 상담원이 즐겨찾기한 것들의 id 집합(목록 화면 배치 — N+1 방지).
     */
    async filterFavoriteIds(
      workspaceId: string,
      conversationIds: string[],
      userId: string,
    ): Promise<Set<string>> {
      const set = new Set<string>();
      if (conversationIds.length === 0) return set;
      const rows = await db
        .select({ conversationId: conversationFavorites.conversationId })
        .from(conversationFavorites)
        .where(
          and(
            eq(conversationFavorites.workspaceId, workspaceId),
            eq(conversationFavorites.userId, userId),
            inArray(conversationFavorites.conversationId, conversationIds),
          ),
        );
      for (const r of rows) set.add(r.conversationId);
      return set;
    },
  };
}

export type FavoriteRepo = ReturnType<typeof makeFavoriteRepo>;
