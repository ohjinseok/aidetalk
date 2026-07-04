/**
 * visitorRepo — 03_DATA_MODEL.md §3.
 * visitor_token 검증(서명)은 서버 단계에서 끝내고, 여기에는 검증된 visitorId가 넘어온다.
 */
import { newId } from "@aidetalk/shared";
import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "../client";
import { visitors, type VisitorAttributes } from "../schema/visitors";

export interface GetOrCreateVisitorInput {
  visitorId?: string; // 토큰에서 복원한 기존 방문자 id(있으면 재사용)
  firstReferrer?: string;
  firstPageUrl?: string;
}

export interface UpdateVisitorProfileInput {
  email?: string;
  name?: string;
  phone?: string;
  attributes?: VisitorAttributes;
}

export function makeVisitorRepo(db: Database) {
  return {
    /**
     * 토큰으로 방문자 조회, 없으면 생성.
     * visitorId가 워크스페이스에 존재하면 반환, 아니면 신규 생성.
     */
    async getOrCreateByToken(workspaceId: string, input: GetOrCreateVisitorInput) {
      if (input.visitorId) {
        const [existing] = await db
          .select()
          .from(visitors)
          .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, input.visitorId)));
        if (existing) return existing;
      }
      const [row] = await db
        .insert(visitors)
        .values({
          id: newId("vis"),
          workspaceId,
          firstReferrer: input.firstReferrer ?? null,
          firstPageUrl: input.firstPageUrl ?? null,
          lastSeenAt: new Date(),
        })
        .returning();
      return row!;
    },

    /** 단건 조회(워크스페이스 격리). 없으면 undefined. */
    async getById(workspaceId: string, visitorId: string) {
      const [row] = await db
        .select()
        .from(visitors)
        .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, visitorId)));
      return row;
    },

    async updateProfile(
      workspaceId: string,
      visitorId: string,
      patch: UpdateVisitorProfileInput,
    ) {
      const [row] = await db
        .update(visitors)
        .set(patch)
        .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, visitorId)))
        .returning();
      return row;
    },

    /**
     * 이메일로 방문자 병합. source를 canonical(같은 이메일의 먼저 생성된 방문자)로 흡수.
     * 원본은 보존하고 mergedInto만 세팅.
     */
    async mergeByEmail(workspaceId: string, email: string, sourceVisitorId: string) {
      const [canonical] = await db
        .select({ id: visitors.id })
        .from(visitors)
        .where(
          and(
            eq(visitors.workspaceId, workspaceId),
            eq(visitors.email, email),
            isNull(visitors.mergedInto),
          ),
        );
      if (!canonical || canonical.id === sourceVisitorId) return undefined;
      const [row] = await db
        .update(visitors)
        .set({ mergedInto: canonical.id })
        .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, sourceVisitorId)))
        .returning();
      return row;
    },

    async touchLastSeen(workspaceId: string, visitorId: string) {
      await db
        .update(visitors)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, visitorId)));
    },
  };
}

export type VisitorRepo = ReturnType<typeof makeVisitorRepo>;
