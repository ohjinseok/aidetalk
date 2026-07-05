"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { td } from "../lib/i18n";
import { useAgentStatus } from "./providers/AgentStatusProvider";
import { useWorkspace } from "./providers/WorkspaceProvider";

/**
 * AI 커넥터가 연속 실패로 auto_disabled됐을 때 워크스페이스 셸 상단에 표시하는 경고 배너.
 * owner 이메일(클라우드 M3 검토)을 v1에서 대체하는 알림 채널 중 하나(웹훅+배너, 08 §1/02 §3.1).
 * 재활성화하면 AgentsScreen이 refresh()를 호출해 자동으로 사라진다.
 */
export function AutoDisabledBanner() {
  const { workspace } = useWorkspace();
  const { hasAutoDisabledAgent } = useAgentStatus();

  if (!hasAutoDisabledAgent) return null;

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <span className="inline-flex items-center gap-1.5">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {td("dashboard.agents.autoDisabledBanner")}
      </span>
      <Link
        href={`/w/${workspace.id}/agents`}
        className="shrink-0 font-medium text-destructive underline hover:opacity-80"
      >
        {td("dashboard.agents.autoDisabledBannerLink")}
      </Link>
    </div>
  );
}
