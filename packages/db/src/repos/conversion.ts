/**
 * conversionRepo — conversions(전환 이벤트, S1). 03_DATA_MODEL.md §3.
 * externalRef 충돌 시 AppError("conversion/duplicate"). 귀속은 조회 시 계산.
 */
import { AppError, newId } from "@aidetalk/shared";
import { and, asc, between, eq, sql } from "drizzle-orm";

import type { Database } from "../client";
import { conversions } from "../schema/conversions";

export interface CreateConversionInput {
  conversationId: string;
  visitorId: string;
  trackedLinkId?: string | null;
  source: "click_only" | "pixel" | "commerce_api" | "booking";
  amount?: number | null; // 원 단위. 예약형 등은 null
  currency?: string;
  externalRef?: string | null; // 멱등키
  occurredAt: Date;
}

export function makeConversionRepo(db: Database) {
  return {
    /** 전환 생성. externalRef 중복(unique 위반) 시 conversion/duplicate. */
    async create(workspaceId: string, input: CreateConversionInput) {
      try {
        const [row] = await db
          .insert(conversions)
          .values({
            id: newId("cvn"),
            workspaceId,
            conversationId: input.conversationId,
            visitorId: input.visitorId,
            trackedLinkId: input.trackedLinkId ?? null,
            source: input.source,
            amount: input.amount ?? null,
            currency: input.currency ?? "KRW",
            externalRef: input.externalRef ?? null,
            occurredAt: input.occurredAt,
          })
          .returning();
        return row!;
      } catch (err) {
        // Postgres unique_violation → 멱등 재수신
        if ((err as { code?: string }).code === "23505") {
          throw AppError.of("conversion/duplicate", "이미 기록된 전환이다.");
        }
        throw err;
      }
    },

    async listByConversation(workspaceId: string, conversationId: string) {
      return db
        .select()
        .from(conversions)
        .where(
          and(
            eq(conversions.workspaceId, workspaceId),
            eq(conversions.conversationId, conversationId),
          ),
        )
        .orderBy(asc(conversions.occurredAt), asc(conversions.id));
    },

    /**
     * 기간 내 트래킹 요약(GET /v1/workspaces/:wsId/tracking/summary, 04 §2).
     * bySource: click_only/pixel 건수. attributedRevenueKrw: trackedLinkId가 있는(=링크 클릭으로
     * 귀속된) 전환의 amount 합 — ⚠️ 규칙 10: "상담 기여 매출(추정)"이며 인과 확정이 아니다.
     */
    async summarizeAttributed(workspaceId: string, from: Date, to: Date) {
      const rows = await db
        .select({
          source: conversions.source,
          count: sql<number>`count(*)::int`,
          attributed: sql<number>`coalesce(sum(${conversions.amount}) filter (where ${conversions.trackedLinkId} is not null), 0)::bigint`,
        })
        .from(conversions)
        .where(
          and(eq(conversions.workspaceId, workspaceId), between(conversions.occurredAt, from, to)),
        )
        .groupBy(conversions.source);

      const bySource = { click_only: 0, pixel: 0 };
      let attributedRevenueKrw = 0;
      for (const row of rows) {
        if (row.source === "click_only" || row.source === "pixel") {
          bySource[row.source] = row.count;
        }
        attributedRevenueKrw += Number(row.attributed);
      }
      return { attributedRevenueKrw, bySource };
    },
  };
}

export type ConversionRepo = ReturnType<typeof makeConversionRepo>;
