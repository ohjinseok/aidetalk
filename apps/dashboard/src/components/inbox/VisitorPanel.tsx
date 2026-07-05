"use client";

import { formatKrw } from "../../lib/format";
import { td } from "../../lib/i18n";
import type { Conversation, ConversationTracking, VisitorDetail } from "../../lib/api/schemas";

/**
 * 방문자 정보 패널(우측, 접이식) — 07 §2.2.
 * TODO(question): 04 §2에 상담원용 방문자 프로필 수정 엔드포인트가 없어 현재는 조회 전용.
 * (위젯 PATCH /v1/widget/profile은 visitor 전용.) 편집 지원 시 API 추가 필요.
 */
export function VisitorPanel({
  visitor,
  conversation,
  tracking,
  isS1,
}: {
  visitor: VisitorDetail;
  conversation: Conversation;
  tracking?: ConversationTracking | null;
  isS1: boolean;
}) {
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
            <dt className="text-xs text-muted-foreground">{td("dashboard.conversation.startPage")}</dt>
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
