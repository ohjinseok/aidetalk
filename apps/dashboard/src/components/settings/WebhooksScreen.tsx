"use client";

import { useState } from "react";

import { webhookApi } from "@/lib/api/endpoints";
import { td, type TranslationKey } from "@/lib/i18n";
import type { Webhook, WebhookEventName } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { SecretModal } from "@/components/agents/SecretModal";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** 04 §2 웹훅 이벤트 카탈로그 — 새 이벤트 추가 시 shared api-responses.ts와 함께 갱신. */
const EVENT_OPTIONS: { value: WebhookEventName; labelKey: TranslationKey }[] = [
  { value: "agent.auto_disabled", labelKey: "dashboard.webhooks.eventAutoDisabled" },
  { value: "conversation.handoff", labelKey: "dashboard.webhooks.eventHandoff" },
];

/** 이벤트 값 → 라벨 키 조회(등록 폼과 목록 배지에서 공용). */
const EVENT_LABEL: Record<WebhookEventName, TranslationKey> = Object.fromEntries(
  EVENT_OPTIONS.map((o) => [o.value, o.labelKey]),
) as Record<WebhookEventName, TranslationKey>;

/** 웹훅 관리 화면(Should, 07 §5) — 등록/목록/삭제 + secret 1회 노출 모달. */
export function WebhooksScreen() {
  const { workspace } = useWorkspace();
  const wsId = workspace.id;
  const toast = useToast();

  const {
    data: webhooks,
    loading,
    reload,
  } = useResource(() => webhookApi.list(wsId), [] as Webhook[], [wsId]);
  const [secret, setSecret] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Webhook | null>(null);

  // 등록 폼
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventName[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function toggleEvent(value: WebhookEventName) {
    setEvents((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value],
    );
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    if (events.length === 0) return;
    setSubmitting(true);
    try {
      const res = await webhookApi.create(wsId, { url, events });
      setSecret(res.secret);
      setUrl("");
      setEvents([]);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(w: Webhook) {
    try {
      await webhookApi.remove(wsId, w.id);
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setRemoveTarget(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {td("dashboard.webhooks.title")}
      </h1>

      <form onSubmit={onRegister}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {td("dashboard.webhooks.registerTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormRow label={td("dashboard.webhooks.url")} htmlFor="webhookUrl">
              <Input
                id="webhookUrl"
                type="url"
                required
                placeholder={td("dashboard.webhooks.urlPlaceholder")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </FormRow>
            <div className="mb-4">
              <span className="mb-1.5 block text-sm font-medium text-foreground">
                {td("dashboard.webhooks.events")}
              </span>
              <div className="flex flex-col gap-1">
                {EVENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={events.includes(opt.value)}
                      onChange={() => toggleEvent(opt.value)}
                    />
                    {td(opt.labelKey)}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={submitting || events.length === 0}>
              {td("dashboard.webhooks.register")}
            </Button>
          </CardContent>
        </Card>
      </form>

      {loading ? (
        <Spinner />
      ) : webhooks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{td("dashboard.webhooks.empty")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {webhooks.map((w) => (
            <li key={w.id}>
              <Card className="py-4 transition-colors hover:bg-accent/50">
                <CardContent className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-foreground">{w.url}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {w.events.map((ev) => (
                        <Badge key={ev} variant="secondary">
                          {td(EVENT_LABEL[ev])}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(w)}>
                    {td("dashboard.common.remove")}
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SecretModal
        open={secret !== null}
        secret={secret ?? ""}
        onClose={() => setSecret(null)}
        titleKey="dashboard.webhooks.secretModalTitle"
        labelKey="dashboard.webhooks.secretLabel"
        warningKey="dashboard.agents.secretWarning"
      />
      <ConfirmDialog
        open={removeTarget !== null}
        danger
        message={td("dashboard.webhooks.removeConfirm")}
        onConfirm={() => removeTarget && void onRemove(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
