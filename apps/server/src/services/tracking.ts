/**
 * 전환 트래킹 서비스 — 02_ARCHITECTURE.md §3.4, 04_API_SPEC.md §2·§3.
 * ⚠️ CLAUDE.md 규칙 10: 여기서 산출하는 수치는 전부 "상담 기여 매출(추정)"이며 인과 확정이 아니다.
 */
import type { AppContext } from "../context";

/** 귀속 탐색 윈도 — 04 §3: "해당 visitor의 최근 30일 내 clicked tracked_link". */
const ATTRIBUTION_WINDOW_DAYS = 30;

export interface AttributionCandidate {
  trackedLinkId: string;
  conversationId: string;
  visitorId: string;
}

/**
 * 방문자의 최근 30일 클릭 이력 중 workspace의 attributionRule에 따라 귀속 후보 1건을 고른다.
 * last_click=가장 최근 클릭, first_click=가장 이른 클릭. 클릭 이력이 없으면 null(호출측은 스킵).
 */
export async function findAttributionCandidate(
  ctx: AppContext,
  workspaceId: string,
  visitorId: string,
  occurredAt: Date,
  rule: "last_click" | "first_click",
): Promise<AttributionCandidate | null> {
  const since = new Date(occurredAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const clicked = await ctx.repos.trackedLink.listClickedByVisitor(
    workspaceId,
    visitorId,
    since,
    occurredAt,
  );
  if (clicked.length === 0) return null;
  // listClickedByVisitor는 clickedAt asc 반환 — first_click=맨 앞, last_click=맨 뒤.
  const chosen = rule === "first_click" ? clicked[0]! : clicked[clicked.length - 1]!;
  return {
    trackedLinkId: chosen.id,
    conversationId: chosen.conversationId,
    visitorId: chosen.visitorId,
  };
}

export interface TrackingSummary {
  conversationCount: number;
  linkedConversations: number;
  clickedConversations: number;
  attributedRevenueKrw: number;
  bySource: { click_only: number; pixel: number };
}

/** GET /v1/workspaces/:wsId/tracking/summary 응답 조립(04 §2). */
export async function buildTrackingSummary(
  ctx: AppContext,
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<TrackingSummary> {
  const [conversationCount, linkedConversations, clickedConversations, revenue] =
    await Promise.all([
      ctx.repos.conversation.countCreatedInPeriod(workspaceId, from, to),
      ctx.repos.trackedLink.countLinkedConversations(workspaceId, from, to),
      ctx.repos.trackedLink.countClickedConversations(workspaceId, from, to),
      ctx.repos.conversion.summarizeAttributed(workspaceId, from, to),
    ]);
  return {
    conversationCount,
    linkedConversations,
    clickedConversations,
    attributedRevenueKrw: revenue.attributedRevenueKrw,
    bySource: revenue.bySource,
  };
}

/** from/to 쿼리 파싱. 미지정/무효 시 최근 30일로 폴백(대시보드 기본 "이번 달"은 클라이언트가 계산해 넘긴다). */
export function parseTrackingRange(fromRaw?: string, toRaw?: string): { from: Date; to: Date } {
  const parsedTo = toRaw ? new Date(toRaw) : new Date();
  const to = Number.isNaN(parsedTo.getTime()) ? new Date() : parsedTo;
  const fallbackFrom = new Date(to.getTime() - ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const parsedFrom = fromRaw ? new Date(fromRaw) : fallbackFrom;
  const from = Number.isNaN(parsedFrom.getTime()) ? fallbackFrom : parsedFrom;
  return { from, to };
}
