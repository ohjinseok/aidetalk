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
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 text-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase text-gray-400">
        {td("dashboard.conversation.infoTitle")}
      </h3>

      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-gray-400">{td("dashboard.conversation.visitorName")}</dt>
          <dd className="text-gray-800">{visitor.name || td("dashboard.common.none")}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400">{td("dashboard.conversation.visitorEmail")}</dt>
          <dd className="break-all text-gray-800">{visitor.email || td("dashboard.common.none")}</dd>
        </div>
        {startPage ? (
          <div>
            <dt className="text-xs text-gray-400">{td("dashboard.conversation.startPage")}</dt>
            <dd className="break-all text-gray-800">{startPage}</dd>
          </div>
        ) : null}
      </dl>

      {attrEntries.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-1 text-xs text-gray-400">{td("dashboard.conversation.attributes")}</h4>
          <dl className="space-y-1">
            {attrEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-gray-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {isS1 && tracking ? (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <h4 className="mb-1 text-xs text-gray-400">
            {td("dashboard.conversation.conversionSummary")}
          </h4>
          <p className="text-gray-800">{formatKrw(revenue)}</p>
        </div>
      ) : null}
    </aside>
  );
}
