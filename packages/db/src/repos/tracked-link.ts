/**
 * trackedLinkRepo — tracked_links(전환 트래킹, S1). 03_DATA_MODEL.md §3.
 */
import { newId } from "@aidetalk/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { Database } from "../client";
import { trackedLinks } from "../schema/tracked-links";

export interface CreateTrackedLinkInput {
  conversationId: string;
  visitorId: string;
  messageId?: string | null;
  targetUrl: string;
  token?: string; // 없으면 짧은 nanoid(10) 자동 생성 (URL 파라미터 at_l)
}

export function makeTrackedLinkRepo(db: Database) {
  return {
    /** 메시지에 담을 링크들을 일괄 생성. 반환 순서는 입력 순서와 동일. */
    async createMany(workspaceId: string, links: CreateTrackedLinkInput[]) {
      if (links.length === 0) return [];
      const values = links.map((l) => ({
        id: newId("tlk"),
        token: l.token ?? nanoid(10),
        workspaceId,
        conversationId: l.conversationId,
        visitorId: l.visitorId,
        messageId: l.messageId ?? null,
        targetUrl: l.targetUrl,
      }));
      return db.insert(trackedLinks).values(values).returning();
    },

    /** 클릭 기록(최초 1회). 이미 클릭된 링크는 clickedAt 유지. */
    async markClicked(workspaceId: string, token: string) {
      const [row] = await db
        .update(trackedLinks)
        .set({ clickedAt: new Date() })
        .where(
          and(
            eq(trackedLinks.workspaceId, workspaceId),
            eq(trackedLinks.token, token),
            isNull(trackedLinks.clickedAt),
          ),
        )
        .returning();
      if (row) return row;
      // 이미 클릭된 경우 기존 행 반환
      const [existing] = await db
        .select()
        .from(trackedLinks)
        .where(and(eq(trackedLinks.workspaceId, workspaceId), eq(trackedLinks.token, token)));
      return existing;
    },

    async listByConversation(workspaceId: string, conversationId: string) {
      return db
        .select()
        .from(trackedLinks)
        .where(
          and(
            eq(trackedLinks.workspaceId, workspaceId),
            eq(trackedLinks.conversationId, conversationId),
          ),
        )
        .orderBy(asc(trackedLinks.createdAt), asc(trackedLinks.id));
    },
  };
}

export type TrackedLinkRepo = ReturnType<typeof makeTrackedLinkRepo>;
