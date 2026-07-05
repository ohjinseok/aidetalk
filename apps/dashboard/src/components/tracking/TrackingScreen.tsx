"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { trackingApi } from "../../lib/api/endpoints";
import { formatKrw } from "../../lib/format";
import { td } from "../../lib/i18n";
import type { TrackingSummary } from "../../lib/api/schemas";
import { useWorkspace } from "../providers/WorkspaceProvider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/** 이번 달 [from, to] ISO. */
function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

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
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-help text-muted-foreground"
                aria-label={hint}
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p
        className={`mt-1 font-semibold tracking-tight text-foreground ${
          emphasis ? "text-2xl" : "text-xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * 전환 트래킹 요약 — 07 §3. S1 전용(규칙 10). 이번 웨이브에서는 요약 카드까지.
 * ⚠️ "상담 기여 매출(추정)" 라벨 문구 고정(규칙 10).
 */
export function TrackingScreen() {
  const { workspace } = useWorkspace();
  const router = useRouter();
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // S2는 트래킹 접근 불가(규칙 10) — 라우트 진입 시 인박스로.
  useEffect(() => {
    if (workspace.segment === "s2_no_site") {
      router.replace(`/w/${workspace.id}/inbox`);
    }
  }, [workspace, router]);

  useEffect(() => {
    if (workspace.segment === "s2_no_site") return;
    let alive = true;
    const range = thisMonthRange();
    trackingApi
      .summary(workspace.id, range)
      .then((s) => alive && setSummary(s))
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [workspace.id, workspace.segment]);

  if (workspace.segment === "s2_no_site") return null;
  if (loading) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }
  if (notFound || !summary) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{td("dashboard.tracking.empty")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {td("dashboard.tracking.title")}
        </h1>
        <span className="text-sm text-muted-foreground">{td("dashboard.tracking.thisMonth")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-semibold text-muted-foreground">
            {td("dashboard.tracking.bySource")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-6 text-sm text-foreground">
          <span>
            {td("dashboard.tracking.sourceClickOnly")}: {summary.bySource.click_only}
          </span>
          <span>
            {td("dashboard.tracking.sourcePixel")}: {summary.bySource.pixel}
          </span>
        </CardContent>
      </Card>

      {/* v1은 pixel 미구현 — 정확도 안내 배너(07 §3). */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
        {td("dashboard.tracking.pixelBanner")}
      </div>
    </div>
  );
}
