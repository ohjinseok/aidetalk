"use client";

import { useState } from "react";

import { workspaceApi } from "@/lib/api/endpoints";
import { td } from "@/lib/i18n";
import type { AttributionRule } from "@aidetalk/shared";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { PageHeader, PageShell, SectionCard } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormRow } from "@/components/ui/form-row";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsTabs } from "./SettingsTabs";

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
    <PageShell width="wide">
      <SettingsTabs />
      {/* 탭은 wide 셸 기준 고정 — 본문만 읽기 폭으로 제한(좌측 정렬 유지) */}
      <div className="max-w-3xl">
      <PageHeader
        title={td("dashboard.workspace.title")}
        description={td("dashboard.workspace.subtitle")}
      />

      <div className="space-y-5">
        {/* 일반 정보 */}
        <SectionCard
          title={td("dashboard.workspace.general")}
          description={td("dashboard.workspace.generalDesc")}
          footer={
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
          }
        >
          <FormRow label={td("dashboard.workspace.name")} htmlFor="wsName" className="mb-0">
            <Input
              id="wsName"
              value={name}
              disabled={!isOwner}
              onChange={(e) => setName(e.target.value)}
            />
          </FormRow>

          {/* 귀속 규칙 — 전환 트래킹(S1)에서만 의미(규칙 10). */}
          {isS1 ? (
            <FormRow
              label={td("dashboard.workspace.attributionRule")}
              htmlFor="attr"
              hint={td("dashboard.workspace.attributionHint")}
              className="mt-4 mb-0"
            >
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
        </SectionCard>

        {/* 결제 탭(클라우드 전용) — ee의 BillingPanel 주입 지점.
            CLAUDE.md 규칙 8: 코어는 ee/를 import하지 않는다 → 여기서는 존재/플래그만 확인. */}
        {IS_CLOUD ? (
          <SectionCard
            title={td("dashboard.workspace.billingTab")}
            description={td("dashboard.workspace.billingCloudOnly")}
          >
            <Badge variant="info">{td("dashboard.workspace.billingTab")}</Badge>
          </SectionCard>
        ) : null}

        {/* 위험 구역 */}
        <SectionCard
          danger
          title={td("dashboard.workspace.dangerZone")}
          description={td("dashboard.workspace.exportHint")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {td("dashboard.workspace.exportCsv")}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {td("dashboard.workspace.exportComingSoon")}
              </p>
            </div>
            {/* TODO(question): 대화 CSV export 엔드포인트가 04 §2에 없음(Could). API 확정 후 연결. */}
            <Button variant="outline" size="sm" disabled>
              {td("dashboard.workspace.exportCsv")}
            </Button>
          </div>
        </SectionCard>
      </div>
      </div>
    </PageShell>
  );
}
