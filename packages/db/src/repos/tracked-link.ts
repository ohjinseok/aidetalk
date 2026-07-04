/**
 * trackedLinkRepo — tracked_links(전환 트래킹, S1). 03_DATA_MODEL.md §3.
 */
import { newId } from "@aidetalk/shared";
import { and, asc, between, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
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

    /**
     * token만으로 조회(workspaceId 미지) — 예외적으로 workspaceId를 첫 인자로 받지 않는다.
     * `/t/click`은 무인증·손님 페이지 컨텍스트라 workspaceId를 모른 채 token만 받는다.
     * token은 전역 unique(스키마 제약)라 단독 조회가 안전하다 — 조회 결과의 workspaceId를
     * 얻어 markClicked(workspaceId, token)를 호출하는 용도로만 쓴다(규칙 11 예외 지점).
     */
    async findByToken(token: string) {
      const [row] = await db.select().from(trackedLinks).where(eq(trackedLinks.token, token));
      return row;
    },

    /**
     * 방문자의 [since, until] 구간 클릭된 링크를 clickedAt 오름차순으로.
     * 전환 귀속 후보 탐색용(04 §3 — "최근 30일 내 clicked tracked_link").
     */
    async listClickedByVisitor(workspaceId: string, visitorId: string, since: Date, until: Date) {
      return db
        .select()
        .from(trackedLinks)
        .where(
          and(
            eq(trackedLinks.workspaceId, workspaceId),
            eq(trackedLinks.visitorId, visitorId),
            isNotNull(trackedLinks.clickedAt),
            gte(trackedLinks.clickedAt, since),
            lte(trackedLinks.clickedAt, until),
          ),
        )
        .orderBy(asc(trackedLinks.clickedAt), asc(trackedLinks.id));
    },

    /** 기간 내 링크가 안내(생성)된 대화 수(distinct) — 트래킹 요약 카드 "링크 안내 대화". */
    async countLinkedConversations(workspaceId: string, from: Date, to: Date) {
      const [row] = await db
        .select({ count: sql<number>`count(distinct ${trackedLinks.conversationId})::int` })
        .from(trackedLinks)
        .where(
          and(eq(trackedLinks.workspaceId, workspaceId), between(trackedLinks.createdAt, from, to)),
        );
      return row?.count ?? 0;
    },

    /** 기간 내 클릭이 발생한 대화 수(distinct) — 트래킹 요약 카드 "클릭 발생 대화". */
    async countClickedConversations(workspaceId: string, from: Date, to: Date) {
      const [row] = await db
        .select({ count: sql<number>`count(distinct ${trackedLinks.conversationId})::int` })
        .from(trackedLinks)
        .where(
          and(
            eq(trackedLinks.workspaceId, workspaceId),
            isNotNull(trackedLinks.clickedAt),
            between(trackedLinks.clickedAt, from, to),
          ),
        );
      return row?.count ?? 0;
    },
  };
}

export type TrackedLinkRepo = ReturnType<typeof makeTrackedLinkRepo>;
