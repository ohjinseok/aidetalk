/**
 * conversionRepo — conversions(전환 이벤트, S1). 03_DATA_MODEL.md §3.
 * externalRef 충돌 시 AppError("conversion/duplicate"). 귀속은 조회 시 계산.
 */
import { AppError, newId } from "@aidetalk/shared";
import { and, asc, between, eq, isNotNull, sql } from "drizzle-orm";

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

export interface AggregatePeriod {
  from: Date;
  to: Date;
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
     * 기간 내 워크스페이스 전환 집계(기여 "추정" — CLAUDE.md 규칙 10).
     * rule(last_click|first_click)은 대화 단위 귀속 계산에 쓰이며, 여기서는
     * 원본 이벤트의 총합/건수를 반환한다. 정교한 귀속은 상위 계층에서 조합.
     */
    async aggregateByWorkspace(
      workspaceId: string,
      period: AggregatePeriod,
      _rule: "last_click" | "first_click" = "last_click",
    ) {
      const [row] = await db
        .select({
          count: sql<number>`count(*)::int`,
          totalAmount: sql<number>`coalesce(sum(${conversions.amount}), 0)::bigint`,
          revenueCount: sql<number>`count(*) filter (where ${conversions.amount} is not null)::int`,
        })
        .from(conversions)
        .where(
          and(
            eq(conversions.workspaceId, workspaceId),
            between(conversions.occurredAt, period.from, period.to),
          ),
        );
      return {
        count: row?.count ?? 0,
        revenueCount: row?.revenueCount ?? 0,
        totalAmount: Number(row?.totalAmount ?? 0),
      };
    },

    /** 특정 전환에 귀속 링크가 있는지 등 조회용 보조(내부). */
    async listAttributed(workspaceId: string) {
      return db
        .select()
        .from(conversions)
        .where(and(eq(conversions.workspaceId, workspaceId), isNotNull(conversions.trackedLinkId)));
    },
  };
}

export type ConversionRepo = ReturnType<typeof makeConversionRepo>;
