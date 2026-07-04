"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { trackingApi } from "../../lib/api/endpoints";
import { formatKrw } from "../../lib/format";
import { td } from "../../lib/i18n";
import type { TrackingSummary } from "../../lib/api/schemas";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";

/** 이번 달 [from, to] ISO. */
function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: from.toISOString(), to: now.toISOString() };
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span>{label}</span>
        {hint ? (
          <span title={hint} className="cursor-help text-gray-400" aria-label={hint}>
            ⓘ
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
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
    return <EmptyState title={td("dashboard.tracking.empty")} />;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{td("dashboard.tracking.title")}</h1>
        <span className="text-sm text-gray-500">{td("dashboard.tracking.thisMonth")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label={td("dashboard.tracking.totalConversations")}
          value={String(summary.conversationCount)}
        />
        <Card
          label={td("dashboard.tracking.linkedConversations")}
          value={String(summary.linkedConversations)}
        />
        <Card
          label={td("dashboard.tracking.clickedConversations")}
          value={String(summary.clickedConversations)}
        />
        <Card
          label={td("dashboard.tracking.attributedRevenue")}
          value={formatKrw(summary.attributedRevenueKrw)}
          hint={td("dashboard.tracking.attributedRevenueTooltip")}
        />
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <h2 className="mb-2 text-xs font-semibold text-gray-500">
          {td("dashboard.tracking.bySource")}
        </h2>
        <div className="flex gap-6">
          <span>
            {td("dashboard.tracking.sourceClickOnly")}: {summary.bySource.click_only}
          </span>
          <span>
            {td("dashboard.tracking.sourcePixel")}: {summary.bySource.pixel}
          </span>
        </div>
      </div>

      {/* v1은 pixel 미구현 — 정확도 안내 배너(07 §3). */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        {td("dashboard.tracking.pixelBanner")}
      </div>
    </div>
  );
}
