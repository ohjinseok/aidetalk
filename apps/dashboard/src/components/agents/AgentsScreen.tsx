"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { agentApi } from "../../lib/api/endpoints";
import { td, tf } from "../../lib/i18n";
import type { Agent, AgentStatus, AgentTestResult } from "../../lib/api/schemas";
import { useAgentStatus } from "../providers/AgentStatusProvider";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyState } from "../ui/EmptyState";
import { FormRow, Input } from "../ui/Field";
import { Spinner } from "../ui/Spinner";
import { SecretModal } from "./SecretModal";

function statusBadge(status: AgentStatus) {
  if (status === "active") return <Badge tone="green">{td("dashboard.agents.statusActive")}</Badge>;
  if (status === "disabled") return <Badge tone="gray">{td("dashboard.agents.statusDisabled")}</Badge>;
  return <Badge tone="red">{td("dashboard.agents.statusAutoDisabled")}</Badge>;
}

export function AgentsScreen() {
  const { workspace, isOwner } = useWorkspace();
  const wsId = workspace.id;
  const toast = useToast();
  const agentStatus = useAgentStatus();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<Agent | null>(null);
  const [testResult, setTestResult] = useState<Record<string, AgentTestResult | "loading">>({});

  // 등록 폼
  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [assistEnabled, setAssistEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function reload() {
    try {
      setAgents(await agentApi.list(wsId));
      // 목록 갱신 시마다 워크스페이스 셸 배너 상태도 함께 동기화(auto_disabled 즉시 반영/소멸).
      await agentStatus.refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [wsId]);

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await agentApi.create(wsId, {
        name,
        endpointUrl,
        timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
      });
      // assistEnabled은 생성 후 PATCH(생성 API는 name/endpointUrl/timeoutMs만).
      if (!assistEnabled) {
        await agentApi.update(wsId, res.agent.id, { assistEnabled: false });
      }
      setSecret(res.secret);
      setName("");
      setEndpointUrl("");
      setTimeoutMs("");
      setAssistEnabled(true);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function onTest(agent: Agent) {
    setTestResult((p) => ({ ...p, [agent.id]: "loading" }));
    try {
      const res = await agentApi.test(wsId, agent.id);
      setTestResult((p) => ({ ...p, [agent.id]: res }));
    } catch (err) {
      toast.error(err);
      setTestResult((p) => {
        const next = { ...p };
        delete next[agent.id];
        return next;
      });
    }
  }

  async function onToggle(agent: Agent) {
    try {
      await agentApi.update(wsId, agent.id, {
        status: agent.status === "active" ? "disabled" : "active",
      });
      await reload();
    } catch (err) {
      toast.error(err);
    }
  }

  async function onRotate(agent: Agent) {
    try {
      const res = await agentApi.rotateSecret(wsId, agent.id);
      setSecret(res.secret);
    } catch (err) {
      toast.error(err);
    } finally {
      setRotateTarget(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl overflow-y-auto p-6">
      <h1 className="mb-4 text-lg font-semibold">{td("dashboard.agents.title")}</h1>

      {/* 등록 폼 (owner) */}
      {isOwner ? (
        <form onSubmit={onRegister} className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">{td("dashboard.agents.registerTitle")}</h2>
          <FormRow label={td("dashboard.agents.name")} htmlFor="agentName">
            <Input id="agentName" required value={name} onChange={(e) => setName(e.target.value)} />
          </FormRow>
          <FormRow label={td("dashboard.agents.endpointUrl")} htmlFor="endpointUrl">
            <Input
              id="endpointUrl"
              type="url"
              required
              placeholder={td("dashboard.agents.endpointPlaceholder")}
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
          </FormRow>
          <FormRow
            label={td("dashboard.agents.timeoutMs")}
            htmlFor="timeoutMs"
            hint={td("dashboard.agents.timeoutHint")}
          >
            <Input
              id="timeoutMs"
              type="number"
              placeholder="30000"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </FormRow>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={assistEnabled}
              onChange={(e) => setAssistEnabled(e.target.checked)}
            />
            {td("dashboard.agents.assistEnabled")}
          </label>
          <Button type="submit" variant="primary" disabled={submitting}>
            {td("dashboard.agents.register")}
          </Button>
        </form>
      ) : null}

      {/* 목록 */}
      {loading ? (
        <Spinner />
      ) : agents.length === 0 ? (
        <EmptyState title={td("dashboard.agents.empty")} />
      ) : (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const tr = testResult[agent.id];
            return (
              <li key={agent.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      {statusBadge(agent.status)}
                    </div>
                    <p className="mt-0.5 break-all text-xs text-gray-500">{agent.endpointUrl}</p>
                    {agent.status === "auto_disabled" ? (
                      <Link
                        href={`/w/${wsId}/agents/${agent.id}/logs`}
                        className="mt-1 inline-block text-xs text-red-600 hover:underline"
                      >
                        {td("dashboard.agents.autoDisabledHint")}
                      </Link>
                    ) : null}
                  </div>
                  <Link
                    href={`/w/${wsId}/agents/${agent.id}/logs`}
                    className="shrink-0 text-xs text-brand hover:underline"
                  >
                    {td("dashboard.agents.viewLogs")}
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void onTest(agent)}>
                    {tr === "loading" ? td("dashboard.agents.testing") : td("dashboard.agents.test")}
                  </Button>
                  {tr && tr !== "loading" ? (
                    <span className={`text-xs ${tr.ok ? "text-green-600" : "text-red-600"}`}>
                      {tr.ok
                        ? tf("dashboard.agents.testOk", { latency: tr.latencyMs ?? 0 })
                        : `${td("dashboard.agents.testFail")}${tr.error ? `: ${tr.error}` : ""}`}
                    </span>
                  ) : null}
                  {isOwner ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setRotateTarget(agent)}>
                        {td("dashboard.agents.rotateSecret")}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void onToggle(agent)}>
                        {agent.status === "active"
                          ? td("dashboard.agents.disable")
                          : td("dashboard.agents.enable")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SecretModal open={secret !== null} secret={secret ?? ""} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={rotateTarget !== null}
        danger
        message={td("dashboard.agents.rotateConfirm")}
        onConfirm={() => rotateTarget && void onRotate(rotateTarget)}
        onCancel={() => setRotateTarget(null)}
      />
    </div>
  );
}
