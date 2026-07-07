"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { agentApi } from "@/lib/api/endpoints";
import { formatMessageTime } from "@/lib/format";
import { td, type TranslationKey } from "@/lib/i18n";
import type { AgentLog, AgentLogOutcome } from "@aidetalk/shared";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { AiChip } from "@/components/inbox/AiChip";
import { Modal } from "@/components/ui/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState<AgentLogOutcome | "">("");
  const [detail, setDetail] = useState<AgentLog | null>(null);

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
    <div className="mx-auto max-w-4xl overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{td("dashboard.logs.title")}</h1>
        <Link href={`/w/${wsId}/agents`} className="text-sm text-primary hover:underline">
          ← {td("dashboard.common.back")}
        </Link>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{td("dashboard.logs.filterOutcome")}</span>
        <Select
          value={outcomeFilter || ALL_OUTCOMES}
          onValueChange={(v) => setOutcomeFilter(v === ALL_OUTCOMES ? "" : (v as AgentLogOutcome))}
        >
          <SelectTrigger className="w-40" aria-label={td("dashboard.logs.filterOutcome")}>
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
        <Spinner />
      ) : visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{td("dashboard.logs.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  {td("dashboard.logs.time")}
                </TableHead>
                <TableHead className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  {td("dashboard.logs.mode")}
                </TableHead>
                <TableHead className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  {td("dashboard.logs.outcome")}
                </TableHead>
                <TableHead className="text-right text-[11px] font-medium tracking-wide text-muted-foreground">
                  {td("dashboard.logs.latency")}
                </TableHead>
                <TableHead className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  {td("dashboard.logs.preview")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((log) => {
                const rs = log.responseSummary as Record<string, unknown> | null | undefined;
                const latency = rs && typeof rs.latencyMs === "number" ? `${rs.latencyMs}ms` : "";
                return (
                  <TableRow key={log.id} className="cursor-pointer" onClick={() => setDetail(log)}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatMessageTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      {log.mode === "reply" ? (
                        <AiChip />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {td("dashboard.logs.modeAssist")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={OUTCOME_VARIANT[log.outcome]}>
                        {td(OUTCOME_KEY[log.outcome])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {latency}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {preview(log.requestSummary)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {cursor && !loading ? (
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => void load(false)}>
            {td("dashboard.common.loadMore")}
          </Button>
        </div>
      ) : null}

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={td("dashboard.logs.detailTitle")}
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                {td("dashboard.logs.requestSummary")}
              </p>
              <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs text-foreground">
                {JSON.stringify(detail.requestSummary, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                {td("dashboard.logs.responseSummary")}
              </p>
              <pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs text-foreground">
                {JSON.stringify(detail.responseSummary ?? null, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
