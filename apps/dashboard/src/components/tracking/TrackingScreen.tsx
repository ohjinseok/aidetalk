"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowUpRight, Calendar, Info, TriangleAlert } from "lucide-react";

import { trackingApi } from "@/lib/api/endpoints";
import { formatKrw } from "@/lib/format";
import { td } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TrackingSummary } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell, SectionCard } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** 이번 달 [from, to] ISO. */
function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** 스탯 카드 — 라벨(위·muted) / 수치(아래·강조). 매출 카드는 살짝 강조. */
function StatCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-xs",
        emphasis && "bg-muted/40 dark:bg-muted/20",
      )}
    >
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="cursor-help text-muted-foreground" aria-label={hint}>
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

/** 소스별 구성 범례 항목 — 색 스와치 + 라벨 + 수치. */
function SourceLegend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("size-2.5 shrink-0 rounded-sm", swatch)} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * 전환 트래킹 요약 — 07 §3. S1 전용(규칙 10).
 * ⚠️ "상담 기여 매출(추정)" 라벨·툴팁 문구 고정(규칙 10).
 */
export function TrackingScreen() {
  const { workspace } = useWorkspace();
  const router = useRouter();

  // S2는 트래킹 접근 불가(규칙 10) — 라우트 진입 시 인박스로.
  useEffect(() => {
    if (workspace.segment === "s2_no_site") {
      router.replace(`/w/${workspace.id}/inbox`);
    }
  }, [workspace, router]);

  // 실패 시 토스트 대신 notFound 화면으로 대체 — summary는 초기값(null)에 머무른다.
  const { data: summary, loading } = useResource<TrackingSummary | null>(
    () =>
      workspace.segment === "s2_no_site"
        ? Promise.resolve(null)
        : trackingApi.summary(workspace.id, thisMonthRange()),
    null,
    [workspace.id, workspace.segment],
    { onError: () => {} },
  );

  if (workspace.segment === "s2_no_site") return null;
  if (loading) {
    return (
      <PageShell width="wide">
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </PageShell>
    );
  }
  if (!summary) {
    return (
      <PageShell width="wide">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{td("dashboard.tracking.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </PageShell>
    );
  }

  const widgetGuideHref = `/w/${workspace.id}/settings/widget`;
  const { click_only: clickOnly, pixel } = summary.bySource;
  const sourceTotal = clickOnly + pixel;
  const hasConversionData =
    summary.clickedConversations > 0 || summary.attributedRevenueKrw > 0 || sourceTotal > 0;

  return (
    <PageShell width="wide">
      <PageHeader
        title={td("dashboard.tracking.title")}
        description={td("dashboard.tracking.description")}
        actions={
          <div className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-sm shadow-xs">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {td("dashboard.tracking.thisMonth")}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={td("dashboard.tracking.totalConversations")}
          value={String(summary.conversationCount)}
        />
        <StatCard
          label={td("dashboard.tracking.linkedConversations")}
          value={String(summary.linkedConversations)}
        />
        <StatCard
          label={td("dashboard.tracking.clickedConversations")}
          value={String(summary.clickedConversations)}
        />
        <StatCard
          label={td("dashboard.tracking.attributedRevenue")}
          value={formatKrw(summary.attributedRevenueKrw)}
          hint={td("dashboard.tracking.attributedRevenueTooltip")}
          emphasis
        />
      </div>

      <div className="mt-4">
        <SectionCard title={td("dashboard.tracking.bySource")}>
          {sourceTotal === 0 ? (
            <p className="text-sm text-muted-foreground">
              {td("dashboard.tracking.bySourceEmpty")}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {clickOnly > 0 ? (
                  <div
                    className="h-full bg-foreground"
                    style={{ width: `${(clickOnly / sourceTotal) * 100}%` }}
                  />
                ) : null}
                {pixel > 0 ? (
                  <div
                    className="h-full bg-info"
                    style={{ width: `${(pixel / sourceTotal) * 100}%` }}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <SourceLegend
                  swatch="bg-foreground"
                  label={td("dashboard.tracking.sourceClickOnly")}
                  value={clickOnly}
                />
                <SourceLegend
                  swatch="bg-info"
                  label={td("dashboard.tracking.sourcePixel")}
                  value={pixel}
                />
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {hasConversionData ? (
        // v1은 pixel 미구현 — 정확도 안내 배너(07 §3). 배너 전체를 설치 가이드로 연결.
        <Link
          href={widgetGuideHref}
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning outline-none transition-colors hover:bg-warning/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{td("dashboard.tracking.pixelBanner")}</span>
          <ArrowUpRight className="mt-0.5 size-4 shrink-0" />
        </Link>
      ) : (
        // 데이터 0 상태 — 방치돼 보이지 않게 설치 안내로 다음 행동을 제시.
        <div className="mt-4">
          <SectionCard
            title={td("dashboard.tracking.gettingStartedTitle")}
            footer={
              <Button asChild variant="outline" size="sm">
                <Link href={widgetGuideHref}>
                  {td("dashboard.tracking.gettingStartedCta")}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            }
          >
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {td("dashboard.tracking.gettingStartedDesc")}
            </p>
          </SectionCard>
        </div>
      )}
    </PageShell>
  );
}
