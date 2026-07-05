/**
 * visitorRepo — 03_DATA_MODEL.md §3.
 * visitor_token 검증(서명)은 서버 단계에서 끝내고, 여기에는 검증된 visitorId가 넘어온다.
 */
import { t } from "@aidetalk/i18n";
import { newId } from "@aidetalk/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../client";
import { conversations } from "../schema/conversations";
import { messages } from "../schema/messages";
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

export interface HardDeletePiiResult {
  /** 익명화된 visitor id 전체(mergedInto 체인/클러스터 포함). */
  visitorIds: string[];
  /** content가 삭제 표시로 치환된 메시지가 있던 대화 id 목록. */
  redactedConversationIds: string[];
}

export function makeVisitorRepo(db: Database) {
  /**
   * mergedInto 체인으로 연결된 visitor 클러스터 전체(자신 포함)를 찾는다.
   * 이메일 병합(mergeByEmail)은 항상 canonical(mergedInto=null)로 흡수하는 단일 계층이지만,
   * 안전하게 위(canonical 방향)로 먼저 거슬러 올라간 뒤, 그 canonical로 흡수된 모든 visitor를
   * 아래(자식 방향) BFS로 모아 반환한다. 워크스페이스 경계 밖 visitor는 포함하지 않는다.
   */
  async function resolveMergeCluster(workspaceId: string, visitorId: string): Promise<string[]> {
    const [start] = await db
      .select()
      .from(visitors)
      .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, visitorId)));
    if (!start) return [];

    // 1) canonical(뿌리)까지 위로 거슬러 올라간다(순환 방어를 위해 방문 집합 사용).
    let rootId = start.id;
    let cursor = start;
    const visitedUp = new Set<string>([start.id]);
    while (cursor.mergedInto && !visitedUp.has(cursor.mergedInto)) {
      visitedUp.add(cursor.mergedInto);
      const [parent] = await db
        .select()
        .from(visitors)
        .where(and(eq(visitors.workspaceId, workspaceId), eq(visitors.id, cursor.mergedInto)));
      if (!parent) break;
      rootId = parent.id;
      cursor = parent;
    }

    // 2) rootId로부터 아래로(mergedInto = 현재 프론티어) BFS — 클러스터 전체 수집.
    const cluster = new Set<string>([rootId]);
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await db
        .select({ id: visitors.id })
        .from(visitors)
        .where(and(eq(visitors.workspaceId, workspaceId), inArray(visitors.mergedInto, frontier)));
      const newIds = children.map((c) => c.id).filter((id) => !cluster.has(id));
      newIds.forEach((id) => cluster.add(id));
      frontier = newIds;
    }
    return Array.from(cluster);
  }

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

    /**
     * PII 파기(익명화) — 08_SECURITY.md §6 / 03_DATA_MODEL.md §0.
     * ⚠️ 완전 행 삭제(hard delete)가 아니라 **익명화**다: FK 연쇄 삭제로 대화 이력 자체가
     * 사라지면 상담 기록 감사가 불가능해지므로, 대화 구조(conversations/messages 행)는
     * 보존하고 visitor의 PII 필드와 방문자가 작성한 메시지 본문만 지운다.
     * - visitors.email/name/phone → null, attributes → {}
     * - 해당 visitor(role='visitor')가 작성한 메시지 content → i18n `server.messageRedacted` 상수
     * - mergedInto 체인(이메일 병합 클러스터) 전체를 함께 익명화(동일인 중복 방문자 누락 방지)
     * - tracked_links/conversions/assist_suggestions/conversation_events는 visitorId "참조"만
     *   가지고 있고 그 자체가 PII 값은 아니므로 구조 보존을 위해 그대로 둔다.
     * 대상 visitor가 없으면 undefined.
     */
    async hardDeletePii(workspaceId: string, visitorId: string): Promise<HardDeletePiiResult | undefined> {
      const clusterIds = await resolveMergeCluster(workspaceId, visitorId);
      if (clusterIds.length === 0) return undefined;

      await db
        .update(visitors)
        .set({ email: null, name: null, phone: null, attributes: {} })
        .where(and(eq(visitors.workspaceId, workspaceId), inArray(visitors.id, clusterIds)));

      const convRows = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(eq(conversations.workspaceId, workspaceId), inArray(conversations.visitorId, clusterIds)),
        );
      const conversationIds = convRows.map((c) => c.id);

      if (conversationIds.length > 0) {
        await db
          .update(messages)
          .set({ content: { type: "text", text: t("server.messageRedacted") } })
          .where(
            and(inArray(messages.conversationId, conversationIds), eq(messages.role, "visitor")),
          );
      }

      return { visitorIds: clusterIds, redactedConversationIds: conversationIds };
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
