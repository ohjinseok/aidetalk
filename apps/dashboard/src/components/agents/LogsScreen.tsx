"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { agentApi } from "@/lib/api/endpoints";
import { formatMessageTime } from "@/lib/format";
import { td, type TranslationKey } from "@/lib/i18n";
import { fromSentinel, toSentinel } from "@/lib/selectSentinel";
import type { Agent, AgentLog, AgentLogOutcome } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AiChip } from "@/components/inbox/AiChip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

// Radix Select는 빈 문자열 value 불가 — "전체" 필터에 센티넬 값을 쓴다.
const ALL_OUTCOMES = "all";

const OUTCOMES: AgentLogOutcome[] = ["reply", "handoff", "noop", "suggest", "timeout", "error"];
const OUTCOME_KEY: Record<AgentLogOutcome, TranslationKey> = {
  reply: "dashboard.logs.outcomeReply",
  handoff: "dashboard.logs.outcomeHandoff",
  noop: "dashboard.logs.outcomeNoop",
  suggest: "dashboard.logs.outcomeSuggest",
  timeout: "dashboard.logs.outcomeTimeout",
  error: "dashboard.logs.outcomeError",
};
// 상태 코드 뱃지 시맨틱 변형 — 성공/정보/중립/경고/실패를 토큰으로 구분.
const OUTCOME_VARIANT: Record<
  AgentLogOutcome,
  "success" | "info" | "soft" | "warning" | "destructive"
> = {
  reply: "success",
  handoff: "info",
  noop: "soft",
  suggest: "info",
  timeout: "warning",
  error: "destructive",
};

function preview(summary: unknown): string {
  if (summary && typeof summary === "object") {
    const s = summary as Record<string, unknown>;
    const t = s.textPreview ?? s.messageText;
    if (typeof t === "string") return t;
  }
  return "";
}

export function LogsScreen({ agentId }: { agentId: string }) {
  const { workspace } = useWorkspace();
  const wsId = workspace.id;
  const toast = useToast();

  // 커넥터명 맥락 표시용 — 단건 조회 API가 없어 목록에서 찾는다(v1). 실패 시 조용히 null 유지.
  const { data: agent } = useResource<Agent | null>(
    () => agentApi.list(wsId).then((list) => list.find((a) => a.id === agentId) ?? null),
    null,
    [wsId, agentId],
    { onError: () => {} },
  );
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState<AgentLogOutcome | "">("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    try {
      const res = await agentApi.logs(wsId, {
        agentId,
        cursor: reset ? undefined : cursor || undefined,
      });
      setLogs((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
  }, [wsId, agentId]);

  // outcome 필터는 클라이언트에서 적용(단순 검색, v1).
  const visible = outcomeFilter ? logs.filter((l) => l.outcome === outcomeFilter) : logs;

  return (
    <PageShell width="wide">
      <PageHeader
        title={agent?.name ?? td("dashboard.logs.title")}
        description={td("dashboard.logs.description")}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/w/${wsId}/agents`}>
              <ChevronLeft />
              {td("dashboard.logs.backToAgents")}
            </Link>
          </Button>
        }
      />

      {agent ? (
        <p className="mb-4 -mt-3 break-all font-mono text-xs text-muted-foreground">
          {agent.endpointUrl}
        </p>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{td("dashboard.logs.filterOutcome")}</span>
        <Select
          value={toSentinel(outcomeFilter, ALL_OUTCOMES, "")}
          onValueChange={(v) =>
            setOutcomeFilter(fromSentinel(v, ALL_OUTCOMES, "") as AgentLogOutcome | "")
          }
        >
          <SelectTrigger className="h-8 w-40 text-xs" aria-label={td("dashboard.logs.filterOutcome")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OUTCOMES}>{td("dashboard.logs.all")}</SelectItem>
            {OUTCOMES.map((o) => (
              <SelectItem key={o} value={o}>
                {td(OUTCOME_KEY[o])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{td("dashboard.logs.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {/* 헤더 행 — 밀도 컴팩트(13px) */}
          <div className="grid grid-cols-[9rem_5rem_6rem_5rem_1fr] items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground">
            <span>{td("dashboard.logs.time")}</span>
            <span>{td("dashboard.logs.mode")}</span>
            <span>{td("dashboard.logs.outcome")}</span>
            <span className="text-right">{td("dashboard.logs.latency")}</span>
            <span>{td("dashboard.logs.preview")}</span>
          </div>
          <ul className="divide-y divide-border/60">
            {visible.map((log) => {
              const rs = log.responseSummary as Record<string, unknown> | null | undefined;
              const latency = rs && typeof rs.latencyMs === "number" ? `${rs.latencyMs}ms` : "";
              const isOpen = expanded === log.id;
              return (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-[9rem_5rem_6rem_5rem_1fr] items-center gap-3 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-accent/40 data-[open=true]:bg-accent/30"
                    data-open={isOpen}
                  >
                    <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                      <ChevronRight
                        className={`size-3 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                      {formatMessageTime(log.createdAt)}
                    </span>
                    <span>
                      {log.mode === "reply" ? (
                        <AiChip />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {td("dashboard.logs.modeAssist")}
                        </span>
                      )}
                    </span>
                    <span>
                      <Badge variant={OUTCOME_VARIANT[log.outcome]}>
                        {td(OUTCOME_KEY[log.outcome])}
                      </Badge>
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{latency}</span>
                    <span className="truncate text-muted-foreground">
                      {preview(log.requestSummary)}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="grid gap-4 border-t border-border/40 bg-muted/20 px-4 py-4 md:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                          {td("dashboard.logs.requestSummary")}
                        </p>
                        <pre className="overflow-x-auto rounded-lg border border-border/60 bg-card p-3 font-mono text-xs text-foreground">
                          {JSON.stringify(log.requestSummary, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                          {td("dashboard.logs.responseSummary")}
                        </p>
                        <pre className="overflow-x-auto rounded-lg border border-border/60 bg-card p-3 font-mono text-xs text-foreground">
                          {JSON.stringify(log.responseSummary ?? null, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {cursor && !loading ? (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => void load(false)}>
            {td("dashboard.common.loadMore")}
          </Button>
        </div>
      ) : null}
    </PageShell>
  );
}
