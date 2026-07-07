"use client";

import Link from "next/link";
import { useState } from "react";

import { agentApi } from "@/lib/api/endpoints";
import { td, tf } from "@/lib/i18n";
import type { Agent, AgentStatus, AgentTestResult } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { useAgentStatus } from "@/components/providers/AgentStatusProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SecretModal } from "./SecretModal";

// 연결 상태 dot — Badge와 동일한 시맨틱 톤(success/muted/destructive)으로 상태를 한 번 더 강조.
function statusDotClass(status: AgentStatus): string {
  if (status === "active") return "bg-success";
  if (status === "disabled") return "bg-muted-foreground/40";
  return "bg-destructive";
}

function statusBadge(status: AgentStatus) {
  if (status === "active")
    return <Badge variant="success">{td("dashboard.agents.statusActive")}</Badge>;
  if (status === "disabled")
    return <Badge variant="secondary">{td("dashboard.agents.statusDisabled")}</Badge>;
  // auto_disabled는 반드시 destructive(빨강) 유지 — 장애 상태를 눈에 띄게.
  return <Badge variant="destructive">{td("dashboard.agents.statusAutoDisabled")}</Badge>;
}

export function AgentsScreen() {
  const { workspace, isOwner } = useWorkspace();
  const wsId = workspace.id;
  const toast = useToast();
  const agentStatus = useAgentStatus();

  // 목록 로드 시 워크스페이스 셸 배너 상태도 함께 동기화(auto_disabled 즉시 반영/소멸).
  const {
    data: agents,
    loading,
    reload,
  } = useResource(
    async () => {
      const list = await agentApi.list(wsId);
      await agentStatus.refresh();
      return list;
    },
    [] as Agent[],
    [wsId],
  );
  const [secret, setSecret] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<Agent | null>(null);
  const [testResult, setTestResult] = useState<Record<string, AgentTestResult | "loading">>({});

  // 등록 폼
  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [assistEnabled, setAssistEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
      <h1 className="mb-4 text-lg font-semibold tracking-tight">{td("dashboard.agents.title")}</h1>

      {/* 등록 폼 (owner) */}
      {isOwner ? (
        <Card className="mb-6 shadow-xs">
          <form onSubmit={onRegister}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {td("dashboard.agents.registerTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormRow label={td("dashboard.agents.name")} htmlFor="agentName">
                <Input
                  id="agentName"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
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
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={assistEnabled}
                  onChange={(e) => setAssistEnabled(e.target.checked)}
                />
                {td("dashboard.agents.assistEnabled")}
              </label>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={submitting}>
                {td("dashboard.agents.register")}
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : null}

      {/* 목록 */}
      {loading ? (
        <Spinner />
      ) : agents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{td("dashboard.agents.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const tr = testResult[agent.id];
            return (
              <li key={agent.id} className="rounded-lg border border-border bg-card p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${statusDotClass(agent.status)}`}
                        aria-hidden
                      />
                      <span className="font-medium text-foreground">{agent.name}</span>
                      {statusBadge(agent.status)}
                    </div>
                    <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                      {agent.endpointUrl}
                    </p>
                    {agent.status === "auto_disabled" ? (
                      <Link
                        href={`/w/${wsId}/agents/${agent.id}/logs`}
                        className="mt-1 inline-block text-xs text-destructive hover:underline"
                      >
                        {td("dashboard.agents.autoDisabledHint")}
                      </Link>
                    ) : null}
                  </div>
                  <Link
                    href={`/w/${wsId}/agents/${agent.id}/logs`}
                    className="shrink-0 text-xs text-primary hover:underline"
                  >
                    {td("dashboard.agents.viewLogs")}
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void onTest(agent)}>
                    {tr === "loading"
                      ? td("dashboard.agents.testing")
                      : td("dashboard.agents.test")}
                  </Button>
                  {tr && tr !== "loading" ? (
                    <span
                      className={`tabular-nums text-xs ${tr.ok ? "text-success" : "text-destructive"}`}
                    >
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
