"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreVertical, Plug, ScrollText } from "lucide-react";

import { agentApi } from "@/lib/api/endpoints";
import { td, tf } from "@/lib/i18n";
import type { Agent, AgentStatus, AgentTestResult } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { useAgentStatus } from "@/components/providers/AgentStatusProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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

  // 등록 폼(Dialog)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [name, setName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");
  const [assistEnabled, setAssistEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setEndpointUrl("");
    setTimeoutMs("");
    setAssistEnabled(true);
    setAdvancedOpen(false);
  }

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
      setDialogOpen(false);
      resetForm();
      setSecret(res.secret);
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

  const registerButton = isOwner ? (
    <Button onClick={() => setDialogOpen(true)}>{td("dashboard.agents.registerButton")}</Button>
  ) : null;

  return (
    <PageShell width="default">
      <PageHeader
        title={td("dashboard.agents.title")}
        description={td("dashboard.agents.description")}
        actions={registerButton}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : agents.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plug />
            </EmptyMedia>
            <EmptyTitle>{td("dashboard.agents.empty")}</EmptyTitle>
            <EmptyDescription>{td("dashboard.agents.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          {isOwner ? (
            <EmptyContent>
              <Button onClick={() => setDialogOpen(true)}>
                {td("dashboard.agents.registerButton")}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const tr = testResult[agent.id];
            const autoDisabled = agent.status === "auto_disabled";
            return (
              <li
                key={agent.id}
                className="rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-border/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-full ${statusDotClass(agent.status)}`}
                        aria-hidden
                      />
                      <span className="truncate font-medium text-foreground">{agent.name}</span>
                      {statusBadge(agent.status)}
                    </div>
                    <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">
                      {agent.endpointUrl}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="soft">
                        {tf("dashboard.agents.timeoutMeta", { ms: agent.timeoutMs })}
                      </Badge>
                      {agent.assistEnabled ? (
                        <Badge variant="info">{td("dashboard.agents.assistBadge")}</Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => void onTest(agent)}>
                      {tr === "loading"
                        ? td("dashboard.agents.testing")
                        : td("dashboard.agents.test")}
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/w/${wsId}/agents/${agent.id}/logs`}>
                        <ScrollText />
                        {td("dashboard.agents.viewLogs")}
                      </Link>
                    </Button>
                    {isOwner ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={td("dashboard.common.actions")}
                          >
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void onToggle(agent)}>
                            {agent.status === "active"
                              ? td("dashboard.agents.disable")
                              : td("dashboard.agents.enable")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setRotateTarget(agent)}>
                            {td("dashboard.agents.rotateSecret")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>

                {/* 연결 테스트 결과 — 인라인 표시 */}
                {tr && tr !== "loading" ? (
                  <p
                    className={`mt-3 tabular-nums text-xs ${tr.ok ? "text-success" : "text-destructive"}`}
                  >
                    {tr.ok
                      ? tf("dashboard.agents.testOk", { latency: tr.latencyMs ?? 0 })
                      : `${td("dashboard.agents.testFail")}${tr.error ? `: ${tr.error}` : ""}`}
                  </p>
                ) : null}

                {/* auto_disabled — 장애 강조 + 재활성 액션 */}
                {autoDisabled ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-destructive">
                        {td("dashboard.agents.autoDisabledCard")}
                      </p>
                      <Link
                        href={`/w/${wsId}/agents/${agent.id}/logs`}
                        className="text-xs text-destructive/80 underline-offset-2 hover:underline"
                      >
                        {td("dashboard.agents.autoDisabledHint")}
                      </Link>
                    </div>
                    {isOwner ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => void onToggle(agent)}
                      >
                        {td("dashboard.agents.reactivate")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* 등록 다이얼로그 */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent>
          <form onSubmit={onRegister}>
            <DialogHeader>
              <DialogTitle>{td("dashboard.agents.registerTitle")}</DialogTitle>
              <DialogDescription>{td("dashboard.agents.registerDescription")}</DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-1">
              <FormRow label={td("dashboard.agents.name")} htmlFor="agentName">
                <Input
                  id="agentName"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormRow>
              <FormRow
                label={td("dashboard.agents.endpointUrl")}
                htmlFor="endpointUrl"
                hint={td("dashboard.agents.endpointHint")}
              >
                <Input
                  id="endpointUrl"
                  type="url"
                  required
                  placeholder={td("dashboard.agents.endpointPlaceholder")}
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                />
              </FormRow>

              <label className="flex items-center gap-2 py-1 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={assistEnabled}
                  onChange={(e) => setAssistEnabled(e.target.checked)}
                />
                {td("dashboard.agents.assistEnabled")}
              </label>

              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  {advancedOpen
                    ? td("dashboard.agents.advancedHide")
                    : td("dashboard.agents.advancedShow")}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
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
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                {td("dashboard.common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {td("dashboard.agents.register")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SecretModal open={secret !== null} secret={secret ?? ""} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={rotateTarget !== null}
        danger
        message={td("dashboard.agents.rotateConfirm")}
        onConfirm={() => rotateTarget && void onRotate(rotateTarget)}
        onCancel={() => setRotateTarget(null)}
      />
    </PageShell>
  );
}
