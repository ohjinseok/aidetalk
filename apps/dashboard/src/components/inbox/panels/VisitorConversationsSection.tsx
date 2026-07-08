"use client";

import Link from "next/link";

import type { ConversationStatus, InboxItem } from "@aidetalk/shared";

import { visitorApi } from "@/lib/api/endpoints";
import { formatMessageTime } from "@/lib/format";
import { td, type TranslationKey } from "@/lib/i18n";
import { useResource } from "@/hooks/useResource";
import { Badge } from "@/components/ui/badge";
import { DetailsSection } from "../DetailsSidebar";

const STATUS_LABEL: Record<ConversationStatus, TranslationKey> = {
  open: "dashboard.inbox.filterOpen",
  pending: "dashboard.inbox.filterPending",
  closed: "dashboard.inbox.filterClosed",
};
const STATUS_VARIANT: Record<ConversationStatus, "success" | "warning" | "soft"> = {
  open: "success",
  pending: "warning",
  closed: "soft",
};

/** 같은 고객의 다른 상담 — 현재 대화는 제외. 클릭 시 해당 대화로 이동. */
export function VisitorConversationsSection({
  wsId,
  visitorId,
  currentConvId,
}: {
  wsId: string;
  visitorId: string;
  currentConvId: string;
}) {
  // 실패해도 items는 초기값(null)에 머물고 list는 빈 배열로 취급된다(기존 동작과 동치).
  // 방문자/대화 전환 시 이전 목록 잔상 방지를 위해 resetOnDepsChange.
  const { data: items } = useResource<InboxItem[] | null>(
    () =>
      visitorApi
        .conversations(wsId, visitorId)
        .then((r) => r.items.filter((i) => i.conversation.id !== currentConvId)),
    null,
    [wsId, visitorId, currentConvId],
    { onError: () => {}, resetOnDepsChange: true },
  );

  const list = items ?? [];
  if (list.length === 0) return null;

  return (
    <DetailsSection
      name="otherConversations"
      title={td("dashboard.conversation.otherConversations")}
      defaultOpen={false}
    >
      <ul className="space-y-1">
        {list.map((it) => (
          <li key={it.conversation.id}>
            <Link
              href={`/w/${wsId}/inbox/${it.conversation.id}`}
              className="block rounded-md p-2 hover:bg-accent"
            >
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <Badge variant={STATUS_VARIANT[it.conversation.status]}>
                  {td(STATUS_LABEL[it.conversation.status])}
                </Badge>
                {it.lastMessage ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatMessageTime(it.lastMessage.createdAt)}
                  </span>
                ) : null}
              </div>
              {it.lastMessage ? (
                <p className="truncate text-[13px] text-muted-foreground">
                  {it.lastMessage.textPreview}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </DetailsSection>
  );
}
