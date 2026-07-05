"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { agentApi } from "../../lib/api/endpoints";
import { formatMessageTime } from "../../lib/format";
import { td, type TranslationKey } from "../../lib/i18n";
import type { AgentLog, AgentLogOutcome } from "../../lib/api/schemas";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Field";
import { Spinner } from "../ui/Spinner";

const OUTCOMES: AgentLogOutcome[] = ["reply", "handoff", "noop", "suggest", "timeout", "error"];
const OUTCOME_KEY: Record<AgentLogOutcome, TranslationKey> = {
  reply: "dashboard.logs.outcomeReply",
  handoff: "dashboard.logs.outcomeHandoff",
  noop: "dashboard.logs.outcomeNoop",
  suggest: "dashboard.logs.outcomeSuggest",
  timeout: "dashboard.logs.outcomeTimeout",
  error: "dashboard.logs.outcomeError",
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
        <h1 className="text-lg font-semibold">{td("dashboard.logs.title")}</h1>
        <Link href={`/w/${wsId}/agents`} className="text-sm text-brand hover:underline">
          ← {td("dashboard.common.back")}
        </Link>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs text-gray-500">{td("dashboard.logs.filterOutcome")}</label>
        <Select
          className="w-40"
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value as AgentLogOutcome | "")}
        >
          <option value="">{td("dashboard.logs.all")}</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {td(OUTCOME_KEY[o])}
            </option>
          ))}
        </Select>
      </div>

      {loading && logs.length === 0 ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState title={td("dashboard.logs.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs text-gray-400">
              <tr>
                <th className="px-3 py-2">{td("dashboard.logs.time")}</th>
                <th className="px-3 py-2">{td("dashboard.logs.mode")}</th>
                <th className="px-3 py-2">{td("dashboard.logs.outcome")}</th>
                <th className="px-3 py-2">{td("dashboard.logs.latency")}</th>
                <th className="px-3 py-2">{td("dashboard.logs.preview")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((log) => {
                const rs = log.responseSummary as Record<string, unknown> | null | undefined;
                const latency = rs && typeof rs.latencyMs === "number" ? `${rs.latencyMs}ms` : "";
                return (
                  <tr
                    key={log.id}
                    className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
                    onClick={() => setDetail(log)}
                  >
                    <td className="px-3 py-2 text-gray-600">{formatMessageTime(log.createdAt)}</td>
                    <td className="px-3 py-2">{log.mode}</td>
                    <td className="px-3 py-2">{td(OUTCOME_KEY[log.outcome])}</td>
                    <td className="px-3 py-2 text-gray-500">{latency}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-gray-500">
                      {preview(log.requestSummary)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          <div className="space-y-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                {td("dashboard.logs.requestSummary")}
              </p>
              <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                {JSON.stringify(detail.requestSummary, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                {td("dashboard.logs.responseSummary")}
              </p>
              <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                {JSON.stringify(detail.responseSummary ?? null, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
