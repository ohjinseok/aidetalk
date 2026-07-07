"use client";

import type { Conversation } from "@aidetalk/shared";

import { td } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { DetailsSection } from "../DetailsSidebar";
import { useInboxFilter } from "../InboxFilterProvider";
import { TagBadge } from "../TagBadge";
import { TagPicker } from "../TagPicker";

/** 대화 metadata에서 문자열 필드를 안전하게 뽑는다. */
function metaString(conversation: Conversation, key: string): string | null {
  const v = conversation.metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** 상담 정보 섹션 — 유입 페이지·상태·태그. */
export function ConversationInfoSection({
  conversation,
  tagIds,
  onSetTagIds,
}: {
  conversation: Conversation;
  tagIds: string[];
  onSetTagIds: (next: string[]) => void;
}) {
  const { tagById } = useInboxFilter();
  const startPage = metaString(conversation, "startPageUrl");
  const attachedTags = tagIds.map((id) => tagById.get(id)).filter((t) => t !== undefined);

  const statusKey =
    conversation.status === "closed"
      ? "dashboard.inbox.filterClosed"
      : conversation.status === "pending"
        ? "dashboard.inbox.filterPending"
        : "dashboard.inbox.filterOpen";
  const statusVariant =
    conversation.status === "closed" ? "soft" : conversation.status === "pending" ? "warning" : "success";

  return (
    <DetailsSection name="conversationInfo" title={td("dashboard.conversation.infoSection")}>
      <div className="space-y-3">
        {/* 상태 배지 — 색 자체가 상태를 설명(진행중/보류중/종료됨). */}
        <Badge variant={statusVariant}>{td(statusKey)}</Badge>

        {startPage ? (
          <div>
            <p className="mb-0.5 text-xs text-muted-foreground">
              {td("dashboard.conversation.startPage")}
            </p>
            <a
              href={startPage}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate text-[13px] text-primary hover:underline"
              title={startPage}
            >
              {startPage}
            </a>
          </div>
        ) : null}

        {/* 태그 — 부착 칩 + 추가 피커. 추가 버튼 라벨이 곧 이 영역의 설명. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {attachedTags.map((t) => (
            <TagBadge
              key={t.id}
              tag={t}
              full
              onRemove={() => onSetTagIds(tagIds.filter((id) => id !== t.id))}
            />
          ))}
          <TagPicker attachedIds={tagIds} onChange={onSetTagIds} />
        </div>
      </div>
    </DetailsSection>
  );
}
