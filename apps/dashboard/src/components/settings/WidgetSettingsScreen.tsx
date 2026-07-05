"use client";

import { useMemo, useState } from "react";

import { workspaceApi } from "../../lib/api/endpoints";
import { td, type TranslationKey } from "../../lib/i18n";
import type { LauncherPosition, OfficeHoursRule, Tone, WidgetSettings } from "../../lib/api/schemas";
import { useToast } from "../providers/ToastProvider";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "../ui/CopyButton";
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

  const embedCode = useMemo(() => {
    const host = process.env.NEXT_PUBLIC_SERVER_URL ?? "https://your-aidetalk-host";
    return `<script>
  (function (d) {
    var s = d.createElement("script");
    s.src = "${host}/widget.js";
    s.async = true;
    s.dataset.workspace = "${workspace.id}";
    d.body.appendChild(s);
  })(document);
</script>`;
  }, [workspace.id]);

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

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-2">
      {/* 폼 */}
      <div className="space-y-6">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {td("dashboard.widget.title")}
        </h1>

        <Card>
          <CardContent>
            <FormRow label={td("dashboard.widget.primaryColor")} htmlFor="primaryColor">
              <div className="flex items-center gap-2">
                <input
                  id="primaryColor"
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="h-9 w-12 rounded-md border border-input bg-transparent"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="w-32"
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

            <FormRow label={td("dashboard.widget.tone")} htmlFor="tone">
              <Select
                value={form.tone}
                onValueChange={(v) => setForm((f) => ({ ...f, tone: v as Tone }))}
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

            <FormRow label={td("dashboard.widget.launcherPosition")} htmlFor="pos">
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
          </CardContent>
        </Card>

        {/* 운영시간 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {td("dashboard.widget.officeHours")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="mb-4 flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                checked={form.officeHours.enabled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    officeHours: { ...f.officeHours, enabled: e.target.checked },
                  }))
                }
              />
              {td("dashboard.widget.officeHoursEnabled")}
            </Label>

            <FormRow label={td("dashboard.widget.timezone")} htmlFor="tz">
              <Input
                id="tz"
                value={form.officeHours.tz}
                onChange={(e) =>
                  setForm((f) => ({ ...f, officeHours: { ...f.officeHours, tz: e.target.value } }))
                }
              />
            </FormRow>

            {form.officeHours.rules.map((rule, i) => (
              <div key={i} className="mb-2 rounded-md border border-border p-2">
                <div className="mb-1 flex flex-wrap gap-1">
                  {DAY_KEYS.map((dk, di) => {
                    const day = di + 1;
                    const on = rule.days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(i, day)}
                        className={`h-7 w-7 rounded-md text-xs ${
                          on
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
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
                    className="w-28"
                    aria-label={td("dashboard.widget.open")}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={rule.close}
                    onChange={(e) => updateRule(i, { close: e.target.value })}
                    className="w-28"
                    aria-label={td("dashboard.widget.close")}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
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
                    {td("dashboard.widget.removeRule")}
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRule}>
              {td("dashboard.widget.addRule")}
            </Button>

            <div className="mt-4">
              <FormRow label={td("dashboard.widget.offHoursMessage")} htmlFor="offHours">
                <Textarea
                  id="offHours"
                  rows={2}
                  value={form.offHoursMessage}
                  onChange={(e) => setForm((f) => ({ ...f, offHoursMessage: e.target.value }))}
                />
              </FormRow>
            </div>
          </CardContent>
        </Card>

        <div>
          <Button disabled={saving || !isOwner} onClick={() => void onSave()}>
            {td("dashboard.common.save")}
          </Button>
          {!isOwner ? (
            <p className="mt-2 text-xs text-muted-foreground">{td("dashboard.members.ownerOnly")}</p>
          ) : null}
        </div>
      </div>

      {/* 프리뷰 + 임베드 */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-foreground">{td("dashboard.widget.preview")}</h2>
        <WidgetPreview settings={form} />

        <h2 className="mb-2 mt-6 text-sm font-medium text-foreground">
          {td("dashboard.widget.embedCode")}
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">{td("dashboard.widget.embedCodeHint")}</p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs text-foreground">
          <code>{embedCode}</code>
        </pre>
        <div className="mt-2">
          <CopyButton value={embedCode} label={td("dashboard.widget.embedCode")} />
        </div>
      </div>
    </div>
  );
}
