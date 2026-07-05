"use client";

import { useState } from "react";

import { visitorApi } from "@/lib/api/endpoints";
import { formatKrw } from "@/lib/format";
import { td } from "@/lib/i18n";
import type { Conversation, ConversationTracking, VisitorDetail } from "@/lib/api/schemas";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * 방문자 정보 패널(우측, 접이식) — 07 §2.2.
 * TODO(question): 04 §2에 상담원용 방문자 프로필 수정 엔드포인트가 없어 현재는 조회 전용.
 * (위젯 PATCH /v1/widget/profile은 visitor 전용.) 편집 지원 시 API 추가 필요.
 * 하단 위험 구역: owner에게만 PII 파기(익명화) 버튼을 노출한다(08 §6, 되돌릴 수 없음).
 */
export function VisitorPanel({
  visitor,
  conversation,
  tracking,
  isS1,
  onPiiDeleted,
}: {
  visitor: VisitorDetail;
  conversation: Conversation;
  tracking?: ConversationTracking | null;
  isS1: boolean;
  /** PII 파기 성공 시 부모가 패널 데이터를 '없음'으로 갱신하도록 알린다. */
  onPiiDeleted?: () => void;
}) {
  const { workspace, isOwner } = useWorkspace();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDeletePii() {
    setDeleting(true);
    try {
      await visitorApi.deletePii(workspace.id, visitor.id);
      toast.success(td("dashboard.visitor.deletePiiDone"));
      onPiiDeleted?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  const startPage =
    typeof conversation.metadata?.startPageUrl === "string"
      ? (conversation.metadata.startPageUrl as string)
      : null;
  const attrs = visitor.attributes ?? {};
  const attrEntries = Object.entries(attrs);

  const revenue = (tracking?.conversions ?? []).reduce((sum, c) => sum + (c.amount ?? 0), 0);

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-border bg-background p-4">
      <h3 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground">
        {td("dashboard.conversation.infoTitle")}
      </h3>

      <dl className="space-y-2.5">
        <Field label={td("dashboard.conversation.visitorName")} value={visitor.name} />
        <Field label={td("dashboard.conversation.visitorEmail")} value={visitor.email} breakAll />
        {startPage ? (
          <div>
            <dt className="text-xs text-muted-foreground">
              {td("dashboard.conversation.startPage")}
            </dt>
            <dd className="truncate text-[13px] text-foreground" title={startPage}>
              {startPage}
            </dd>
          </div>
        ) : null}
      </dl>

      {attrEntries.length > 0 ? (
        <div className="mt-5">
          <h4 className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">
            {td("dashboard.conversation.attributes")}
          </h4>
          <dl className="space-y-1.5">
            {attrEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="shrink-0 text-xs text-muted-foreground">{k}</dt>
                <dd className="truncate text-[13px] text-foreground" title={String(v)}>
                  {String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {isS1 && tracking ? (
        <div className="mt-5 border-t border-border pt-4">
          {/* 상담 기여 매출(추정) — 스탯 블록. 라벨 위, 금액 아래. */}
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
            {td("dashboard.conversation.conversionSummary")}
          </p>
          <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
            {formatKrw(revenue)}
          </p>
        </div>
      ) : null}

      {/* 위험 구역 — owner 전용 PII 파기(익명화). 되돌릴 수 없다(08 §6). */}
      {isOwner ? (
        <div className="mt-6 border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-destructive hover:text-destructive"
            disabled={deleting}
            onClick={() => setConfirming(true)}
          >
            {td("dashboard.visitor.deletePii")}
          </Button>
          <ConfirmDialog
            open={confirming}
            danger
            title={td("dashboard.visitor.deletePiiTitle")}
            message={td("dashboard.visitor.deletePiiConfirm")}
            confirmLabel={td("dashboard.visitor.deletePiiConfirmLabel")}
            onConfirm={() => void onDeletePii()}
            onCancel={() => setConfirming(false)}
          />
        </div>
      ) : null}
    </aside>
  );
}

/** 정의 리스트 한 줄 — 값 없으면 "없음"을 흐리게. */
function Field({
  label,
  value,
  breakAll,
}: {
  label: string;
  value?: string | null;
  breakAll?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          value
            ? `text-[13px] text-foreground${breakAll ? " break-all" : ""}`
            : "text-[13px] text-muted-foreground/70"
        }
      >
        {value || td("dashboard.common.none")}
      </dd>
    </div>
  );
}
