"use client";

import { useState } from "react";

import type { AgentUpdateVisitorRequest, Conversation, VisitorDetail } from "@aidetalk/shared";

import { visitorApi } from "@/lib/api/endpoints";
import { formatMessageTime } from "@/lib/format";
import { td } from "@/lib/i18n";
import { useToast } from "@/components/providers/ToastProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { DetailsSection } from "../DetailsSidebar";

/** firstPageUrl 쿼리스트링에서 utm_* 파라미터를 파싱한다(초기 유입값). */
function parseUtm(url: string | null | undefined): Array<[string, string]> {
  if (!url) return [];
  try {
    const u = new URL(url);
    const out: Array<[string, string]> = [];
    u.searchParams.forEach((v, k) => {
      if (k.toLowerCase().startsWith("utm_")) out.push([k, v]);
    });
    return out;
  } catch {
    return [];
  }
}

function metaString(conversation: Conversation, key: string): string | null {
  const v = conversation.metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * 고객 정보 섹션 — 이름/이메일/전화 인라인 편집 + "더 보기"(디바이스·언어·시간대·유입·UTM).
 * 커스텀 속성과 owner 전용 PII 파기 버튼을 포함(08 §6, 되돌릴 수 없음).
 */
export function CustomerInfoSection({
  wsId,
  visitor,
  conversation,
  onVisitorUpdated,
  onPiiDeleted,
}: {
  wsId: string;
  visitor: VisitorDetail;
  conversation: Conversation;
  onVisitorUpdated: (v: VisitorDetail) => void;
  onPiiDeleted: () => void;
}) {
  const { isOwner } = useWorkspace();
  const toast = useToast();
  const [showMore, setShowMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(patch: AgentUpdateVisitorRequest) {
    try {
      const updated = await visitorApi.update(wsId, visitor.id, patch);
      onVisitorUpdated(updated);
      toast.success(td("dashboard.customer.saved"));
    } catch (err) {
      toast.error(err);
    }
  }

  async function onDeletePii() {
    setDeleting(true);
    try {
      await visitorApi.deletePii(wsId, visitor.id);
      toast.success(td("dashboard.visitor.deletePiiDone"));
      onPiiDeleted();
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  const device = metaString(conversation, "uaSummary");
  const utm = parseUtm(visitor.firstPageUrl);
  const attrs = Object.entries(visitor.attributes ?? {});

  return (
    <DetailsSection name="customer" title={td("dashboard.customer.title")}>
      <dl className="space-y-2.5">
        <EditableField
          label={td("dashboard.customer.name")}
          value={visitor.name}
          onSave={(v) => save({ name: v })}
        />
        <EditableField
          label={td("dashboard.customer.email")}
          value={visitor.email}
          type="email"
          breakAll
          onSave={(v) => save({ email: v })}
        />
        <EditableField
          label={td("dashboard.customer.phone")}
          value={visitor.phone}
          type="tel"
          onSave={(v) => save({ phone: v })}
        />
      </dl>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mt-3 text-xs font-medium text-primary hover:underline"
      >
        {showMore ? td("dashboard.customer.showLess") : td("dashboard.customer.showMore")}
      </button>

      {showMore ? (
        <dl className="mt-3 space-y-2 border-t border-border pt-3">
          <ReadonlyField label={td("dashboard.customer.device")} value={device} />
          <ReadonlyField label={td("dashboard.customer.language")} value={visitor.locale} />
          <ReadonlyField label={td("dashboard.customer.timezone")} value={visitor.timezone} />
          <ReadonlyField
            label={td("dashboard.customer.firstSeen")}
            value={visitor.createdAt ? formatMessageTime(visitor.createdAt) : null}
          />
          <ReadonlyField
            label={td("dashboard.customer.lastSeen")}
            value={visitor.lastSeenAt ? formatMessageTime(visitor.lastSeenAt) : null}
          />
          <ReadonlyField
            label={td("dashboard.conversation.startPage")}
            value={visitor.firstPageUrl}
            breakAll
          />
          <ReadonlyField
            label={td("dashboard.customer.referrer")}
            value={visitor.firstReferrer}
            breakAll
          />
          {utm.length > 0 ? (
            <div>
              <dt className="text-xs text-muted-foreground">{td("dashboard.customer.utm")}</dt>
              <dd className="mt-0.5 space-y-0.5">
                {utm.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-[13px]">
                    <span className="shrink-0 text-muted-foreground">{k}</span>
                    <span className="truncate text-foreground" title={v}>
                      {v}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
          ) : null}

          {/* 커스텀 속성 — 위젯이 심은 attributes. */}
          {attrs.length > 0 ? (
            <div className="pt-1">
              <dt className="mb-1 text-xs text-muted-foreground">
                {td("dashboard.conversation.attributes")}
              </dt>
              <dd className="space-y-1">
                {attrs.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 text-[13px]">
                    <span className="shrink-0 text-muted-foreground">{k}</span>
                    <span className="truncate text-foreground" title={String(v)}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {/* 위험 구역 — owner 전용 PII 파기(익명화). 되돌릴 수 없다(08 §6). */}
      {isOwner ? (
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="xs"
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
    </DetailsSection>
  );
}

/** 클릭하면 Input으로 인라인 편집되는 필드. 값이 없으면 "없음"을 흐리게 표시(그래도 편집 가능). */
function EditableField({
  label,
  value,
  type = "text",
  breakAll,
  onSave,
}: {
  label: string;
  value?: string | null;
  type?: string;
  breakAll?: boolean;
  onSave: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function begin() {
    setDraft(value ?? "");
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    const next = draft.trim();
    const prev = value ?? "";
    if (next === prev) return;
    onSave(next === "" ? null : next);
  }

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        {editing ? (
          <Input
            autoFocus
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            className="mt-0.5 h-8 text-[13px]"
          />
        ) : (
          <button
            type="button"
            onClick={begin}
            className={`block w-full truncate text-left text-[13px] hover:underline ${
              breakAll ? "break-all" : ""
            } ${value ? "text-foreground" : "text-muted-foreground/70"}`}
          >
            {value || td("dashboard.customer.none")}
          </button>
        )}
      </dd>
    </div>
  );
}

/** 읽기 전용 정의 리스트 한 줄 — 값 없으면 렌더하지 않는다. */
function ReadonlyField({
  label,
  value,
  breakAll,
}: {
  label: string;
  value?: string | null;
  breakAll?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-[13px] text-foreground ${breakAll ? "break-all" : "truncate"}`} title={value}>
        {value}
      </dd>
    </div>
  );
}
