"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { workspaceApi } from "@/lib/api/endpoints";
import { td, type TranslationKey } from "@/lib/i18n";
import type {
  LauncherPosition,
  OfficeHoursRule,
  WidgetSettings,
  WidgetTone,
} from "@aidetalk/shared";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell, SectionCard } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SettingsTabs } from "./SettingsTabs";
import { WidgetPreview } from "./WidgetPreview";

const DAY_KEYS: TranslationKey[] = [
  "dashboard.widget.days.1",
  "dashboard.widget.days.2",
  "dashboard.widget.days.3",
  "dashboard.widget.days.4",
  "dashboard.widget.days.5",
  "dashboard.widget.days.6",
  "dashboard.widget.days.7",
];

function withDefaults(s: WidgetSettings): Required<Omit<WidgetSettings, "officeHours">> & {
  officeHours: { enabled: boolean; tz: string; rules: OfficeHoursRule[] };
} {
  return {
    primaryColor: s.primaryColor ?? "#4F46E5",
    greeting: s.greeting ?? "",
    tone: s.tone ?? "formal",
    launcherPosition: s.launcherPosition ?? "right",
    offHoursMessage: s.offHoursMessage ?? "",
    officeHours: {
      enabled: s.officeHours?.enabled ?? false,
      tz: s.officeHours?.tz ?? "Asia/Seoul",
      rules: s.officeHours?.rules ?? [],
    },
  };
}

export function WidgetSettingsScreen() {
  const { workspace, isOwner, refreshWorkspace } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState(() => withDefaults(workspace.widgetSettings));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // 빌드 시점에 인라인되는 NEXT_PUBLIC_SERVER_URL은 셀프호스팅 이미지에서 항상 폴백만
  // 나온다(런타임 env 미반영). 대신 런타임에: env 오버라이드 → 동일 오리진 배포(Caddy 단일
  // 진입점)라면 window.location.origin이 정답 → 그래도 없으면 플레이스홀더 순으로 결정한다.
  // window 접근은 SSR/최초 클라이언트 렌더와 값이 다르면 hydration mismatch가 나므로
  // 마운트 후 useEffect에서만 갱신한다.
  const [runtimeOrigin, setRuntimeOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SERVER_URL) {
      setRuntimeOrigin(window.location.origin);
    }
  }, []);

  const embedCode = useMemo(() => {
    const host =
      process.env.NEXT_PUBLIC_SERVER_URL ?? runtimeOrigin ?? "https://your-aidetalk-host";
    // 06 §1 임베드 계약 그대로: 로더는 window.AideTalk.workspaceId를 읽는다(data 속성이 아니다).
    // 서버 오리진은 로더가 자기 script src에서 유도하므로 별도 설정이 필요 없다.
    return `<script>
  window.AideTalk = { workspaceId: "${workspace.id}" };
</script>
<script async src="${host}/widget.js"></script>`;
  }, [runtimeOrigin, workspace.id]);

  async function onSave() {
    setSaving(true);
    try {
      await workspaceApi.updateSettings(workspace.id, { widgetSettings: form });
      await refreshWorkspace();
      toast.success();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근 불가 환경은 무시(사용자 수동 복사).
    }
  }

  function addRule() {
    setForm((f) => ({
      ...f,
      officeHours: {
        ...f.officeHours,
        rules: [...f.officeHours.rules, { days: [1, 2, 3, 4, 5], open: "09:00", close: "18:00" }],
      },
    }));
  }

  function updateRule(i: number, patch: Partial<OfficeHoursRule>) {
    setForm((f) => ({
      ...f,
      officeHours: {
        ...f.officeHours,
        rules: f.officeHours.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
      },
    }));
  }

  function toggleDay(i: number, day: number) {
    setForm((f) => {
      const rule = f.officeHours.rules[i];
      if (!rule) return f;
      const days = rule.days.includes(day)
        ? rule.days.filter((d) => d !== day)
        : [...rule.days, day].sort((a, b) => a - b);
      return {
        ...f,
        officeHours: {
          ...f.officeHours,
          rules: f.officeHours.rules.map((r, idx) => (idx === i ? { ...r, days } : r)),
        },
      };
    });
  }

  // 저장 푸터 — 소유자만 저장 가능(규칙 11 아님, 07 §5 권한). 비소유자는 안내.
  const saveFooter = (
    <>
      {!isOwner ? (
        <span className="mr-auto text-xs text-muted-foreground">
          {td("dashboard.members.ownerOnly")}
        </span>
      ) : null}
      <Button disabled={saving || !isOwner} onClick={() => void onSave()}>
        {td("dashboard.common.save")}
      </Button>
    </>
  );

  return (
    <PageShell width="wide">
      <SettingsTabs />
      <PageHeader
        title={td("dashboard.widget.title")}
        description={td("dashboard.widget.subtitle")}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* 좌: 설정 폼 */}
        <div className="space-y-5">
          {/* 위젯 모양 */}
          <SectionCard
            title={td("dashboard.widget.appearance")}
            description={td("dashboard.widget.appearanceDesc")}
            footer={saveFooter}
          >
            <FormRow label={td("dashboard.widget.primaryColor")} htmlFor="primaryColor">
              <div className="flex items-center gap-2">
                <input
                  id="primaryColor"
                  type="color"
                  aria-label={td("dashboard.widget.primaryColor")}
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="w-36 font-mono"
                />
              </div>
            </FormRow>

            <FormRow label={td("dashboard.widget.greeting")} htmlFor="greeting">
              <Textarea
                id="greeting"
                rows={2}
                value={form.greeting}
                onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
              />
            </FormRow>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <FormRow label={td("dashboard.widget.tone")} htmlFor="tone" className="mb-0">
                <Select
                  value={form.tone}
                  onValueChange={(v) => setForm((f) => ({ ...f, tone: v as WidgetTone }))}
                >
                  <SelectTrigger id="tone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">{td("dashboard.widget.toneFormal")}</SelectItem>
                    <SelectItem value="casual">{td("dashboard.widget.toneCasual")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>

              <FormRow
                label={td("dashboard.widget.launcherPosition")}
                htmlFor="pos"
                className="mb-0"
              >
                <Select
                  value={form.launcherPosition}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, launcherPosition: v as LauncherPosition }))
                  }
                >
                  <SelectTrigger id="pos" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">{td("dashboard.widget.positionRight")}</SelectItem>
                    <SelectItem value="left">{td("dashboard.widget.positionLeft")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
            </div>
          </SectionCard>

          {/* 운영 시간 */}
          <SectionCard
            title={td("dashboard.widget.officeHours")}
            description={td("dashboard.widget.officeHoursDesc")}
            footer={saveFooter}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={form.officeHours.enabled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    officeHours: { ...f.officeHours, enabled: e.target.checked },
                  }))
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {td("dashboard.widget.officeHoursEnabled")}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {td("dashboard.widget.officeHoursToggleHint")}
                </span>
              </span>
            </label>

            {form.officeHours.enabled ? (
              <div className="mt-5 space-y-5">
                <FormRow
                  label={td("dashboard.widget.timezone")}
                  htmlFor="tz"
                  hint={td("dashboard.widget.timezoneHint")}
                  className="mb-0"
                >
                  <Input
                    id="tz"
                    className="max-w-xs font-mono"
                    value={form.officeHours.tz}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        officeHours: { ...f.officeHours, tz: e.target.value },
                      }))
                    }
                  />
                </FormRow>

                <div>
                  <Label className="mb-2">{td("dashboard.widget.rules")}</Label>
                  <div className="space-y-2">
                    {form.officeHours.rules.map((rule, i) => (
                      <div key={i} className="rounded-lg border border-border/60 p-3">
                        <div className="mb-2.5 flex flex-wrap gap-1">
                          {DAY_KEYS.map((dk, di) => {
                            const day = di + 1;
                            const on = rule.days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(i, day)}
                                aria-pressed={on}
                                className={`size-8 rounded-md text-xs font-medium transition-colors ${
                                  on
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                                }`}
                              >
                                {td(dk)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            value={rule.open}
                            onChange={(e) => updateRule(i, { open: e.target.value })}
                            className="w-32"
                            aria-label={td("dashboard.widget.open")}
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={rule.close}
                            onChange={(e) => updateRule(i, { close: e.target.value })}
                            className="w-32"
                            aria-label={td("dashboard.widget.close")}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            aria-label={td("dashboard.widget.removeRule")}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                officeHours: {
                                  ...f.officeHours,
                                  rules: f.officeHours.rules.filter((_, idx) => idx !== i),
                                },
                              }))
                            }
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addRule}>
                      <PlusIcon />
                      {td("dashboard.widget.addRule")}
                    </Button>
                  </div>
                </div>

                <FormRow
                  label={td("dashboard.widget.offHoursMessage")}
                  htmlFor="offHours"
                  className="mb-0"
                >
                  <Textarea
                    id="offHours"
                    rows={2}
                    value={form.offHoursMessage}
                    onChange={(e) => setForm((f) => ({ ...f, offHoursMessage: e.target.value }))}
                  />
                </FormRow>
              </div>
            ) : null}
          </SectionCard>
        </div>

        {/* 우: 프리뷰 + 설치 (sticky) */}
        <div className="space-y-5 lg:sticky lg:top-8 lg:self-start">
          <SectionCard
            title={td("dashboard.widget.preview")}
            description={td("dashboard.widget.previewDesc")}
          >
            <WidgetPreview settings={form} />
          </SectionCard>

          <SectionCard
            title={td("dashboard.widget.install")}
            description={td("dashboard.widget.embedCodeHint")}
          >
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void copyEmbed()}
                aria-label={td("dashboard.common.copy")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <span className="text-xs font-medium text-success">
                    {td("dashboard.common.copied")}
                  </span>
                ) : (
                  <CopyIcon />
                )}
              </Button>
              {/* 가로 스크롤 대신 줄바꿈 — 긴 URL/ID도 카드 폭 안에서 감싼다 */}
              <pre className="rounded-lg border bg-muted/50 p-3.5 pr-12 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground">
                <code>{embedCode}</code>
              </pre>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageShell>
  );
}
