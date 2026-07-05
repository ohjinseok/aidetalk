"use client";

import { useState } from "react";

import { workspaceApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { AttributionRule } from "@/lib/api/schemas";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** EDITION 플래그 — 클라우드에서만 결제 탭 노출(07 §5). 코어는 ee/를 import하지 않음(규칙 8). */
const IS_CLOUD = process.env.NEXT_PUBLIC_EDITION === "cloud";

export function WorkspaceSettingsScreen() {
  const { workspace, isOwner, refreshWorkspace } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState(workspace.name);
  const [rule, setRule] = useState<AttributionRule>(workspace.attributionRule);
  const [saving, setSaving] = useState(false);

  const isS1 = workspace.segment === "s1_site";

  async function onSave() {
    setSaving(true);
    try {
      await workspaceApi.updateSettings(workspace.id, { name, attributionRule: rule });
      await refreshWorkspace();
      toast.success();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {td("dashboard.workspace.title")}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{td("dashboard.workspace.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormRow label={td("dashboard.workspace.name")} htmlFor="wsName">
            <Input
              id="wsName"
              value={name}
              disabled={!isOwner}
              onChange={(e) => setName(e.target.value)}
            />
          </FormRow>

          {/* 귀속 규칙 — 전환 트래킹(S1)에서만 의미(규칙 10). */}
          {isS1 ? (
            <FormRow label={td("dashboard.workspace.attributionRule")} htmlFor="attr">
              <Select
                value={rule}
                disabled={!isOwner}
                onValueChange={(v) => setRule(v as AttributionRule)}
              >
                <SelectTrigger id="attr" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_click">{td("dashboard.workspace.lastClick")}</SelectItem>
                  <SelectItem value="first_click">
                    {td("dashboard.workspace.firstClick")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button disabled={saving || !isOwner} onClick={() => void onSave()}>
            {td("dashboard.common.save")}
          </Button>
        </CardFooter>
      </Card>

      {/* 결제 탭(클라우드 전용) — ee의 BillingPanel 주입 지점.
          CLAUDE.md 규칙 8: 코어는 ee/를 import하지 않는다 → 여기서는 존재/플래그만 확인. */}
      {IS_CLOUD ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {td("dashboard.workspace.billingTab")}
            </CardTitle>
            <CardDescription>{td("dashboard.workspace.billingCloudOnly")}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* 위험 구역 */}
      <Card className="border-destructive/20 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-destructive">
            {td("dashboard.workspace.dangerZone")}
          </CardTitle>
          <CardDescription className="text-destructive/80">
            {td("dashboard.workspace.exportHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO(question): 대화 CSV export 엔드포인트가 04 §2에 없음(Could). API 확정 후 연결.
              엔드포인트 확정 전까지 disabled — 상단 exportHint가 미구현 안내를 대신한다. */}
          <Button variant="outline" size="sm" disabled>
            {td("dashboard.workspace.exportCsv")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
