"use client";

import type { ConversationTracking } from "@aidetalk/shared";

import { formatKrw } from "@/lib/format";
import { td } from "@/lib/i18n";
import { DetailsSection } from "../DetailsSidebar";

/**
 * 상담 기여 매출(추정) 섹션 — S1 전용(규칙 10: "기여 추정"이지 "인과 확정"이 아니다).
 * 문구는 dashboard.tracking.attributedRevenue 키를 그대로 사용한다.
 */
export function RevenueSection({ tracking }: { tracking: ConversationTracking | null }) {
  if (!tracking) return null;
  const revenue = tracking.conversions.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  return (
    <DetailsSection name="revenue" title={td("dashboard.conversation.conversionSummary")}>
      <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
        {td("dashboard.tracking.attributedRevenue")}
      </p>
      <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {formatKrw(revenue)}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {td("dashboard.tracking.attributedRevenueTooltip")}
      </p>
    </DetailsSection>
  );
}
