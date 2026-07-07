"use client";

import { useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { webhookApi } from "@/lib/api/endpoints";
import { td, type TranslationKey } from "@/lib/i18n";
import type { Webhook, WebhookEventName } from "@aidetalk/shared";
import { useResource } from "@/hooks/useResource";
import { SecretModal } from "@/components/agents/SecretModal";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell, SectionCard } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { SettingsTabs } from "./SettingsTabs";

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
  const urlRef = useRef<HTMLInputElement>(null);

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

  function focusForm() {
    urlRef.current?.focus();
    urlRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <PageShell width="narrow">
      <SettingsTabs />
      <PageHeader
        title={td("dashboard.webhooks.title")}
        description={td("dashboard.webhooks.subtitle")}
      />

      <div className="space-y-5">
        {/* 등록된 웹훅 */}
        <SectionCard
          title={td("dashboard.webhooks.listTitle")}
          description={td("dashboard.webhooks.listDesc")}
          contentClassName={loading || webhooks.length === 0 ? "px-6 py-6" : "p-0"}
        >
          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : webhooks.length === 0 ? (
            <Empty className="border-0 gap-3 p-0 py-2 md:p-0 md:py-2">
              <EmptyHeader>
                <EmptyTitle>{td("dashboard.webhooks.empty")}</EmptyTitle>
                <EmptyDescription>{td("dashboard.webhooks.emptyDesc")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={focusForm}>
                  {td("dashboard.webhooks.registerTitle")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="divide-y divide-border/60">
              {webhooks.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start gap-3 px-6 py-4 transition-colors hover:bg-accent/40"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      w.status === "active" ? "bg-success" : "bg-muted-foreground/40"
                    }`}
                    title={td(
                      w.status === "active"
                        ? "dashboard.webhooks.statusActive"
                        : "dashboard.webhooks.statusDisabled",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-foreground">{w.url}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {w.events.map((ev) => (
                        <Badge key={ev} variant="soft">
                          {td(EVENT_LABEL[ev])}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={td("dashboard.common.remove")}
                    onClick={() => setRemoveTarget(w)}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 웹훅 추가 */}
        <form onSubmit={onRegister}>
          <SectionCard
            title={td("dashboard.webhooks.registerTitle")}
            description={td("dashboard.webhooks.registerDesc")}
            footer={
              <Button type="submit" disabled={submitting || events.length === 0}>
                {td("dashboard.webhooks.register")}
              </Button>
            }
          >
            <div className="mb-4 flex flex-col gap-1.5">
              <Label htmlFor="webhookUrl">{td("dashboard.webhooks.url")}</Label>
              <Input
                id="webhookUrl"
                ref={urlRef}
                type="url"
                required
                className="font-mono"
                placeholder={td("dashboard.webhooks.urlPlaceholder")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{td("dashboard.webhooks.events")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {EVENT_OPTIONS.map((opt) => {
                  const checked = events.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors ${
                        checked
                          ? "border-primary/40 bg-primary/5 text-foreground"
                          : "border-border/60 text-foreground hover:bg-accent/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() => toggleEvent(opt.value)}
                      />
                      {td(opt.labelKey)}
                    </label>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        </form>
      </div>

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
    </PageShell>
  );
}
