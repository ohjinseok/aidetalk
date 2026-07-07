/**
 * 인박스 실시간 리듀서 — 04 §5.4 inbox.upsert 처리.
 * 순수 함수로 분리(단위 테스트 대상, 09 문서 메시징 신뢰성).
 */
import type { ConversationStatus, InboxItem } from "@aidetalk/shared";

/** lastMessageAt desc 정렬 키. null은 최하단. */
function sortKey(item: InboxItem): number {
  const at = item.conversation.lastMessageAt;
  return at ? new Date(at).getTime() : 0;
}

/**
 * 멤버별 필드 병합 — WS 브로드캐스트는 서버 조인 여부에 따라 favorite/unread/tagIds를
 * 실어 보내지 않을 수 있다(예: 다른 상담원 액션으로 발생한 브로드캐스트).
 * - favorite: incoming에 없으면(undefined) 기존 값을 그대로 보존.
 * - unread/tagIds: incoming에 있으면 교체, 없으면 보존(entities.ts상 상담원 전용 부가 필드와 동일 취급).
 */
function mergeMemberFields(existing: InboxItem | undefined, incoming: InboxItem): InboxItem {
  if (!existing) return incoming;
  return {
    ...incoming,
    favorite: incoming.favorite !== undefined ? incoming.favorite : existing.favorite,
    unread: incoming.unread !== undefined ? incoming.unread : existing.unread,
    tagIds: incoming.tagIds !== undefined ? incoming.tagIds : existing.tagIds,
  };
}

/**
 * 목록에 요약을 upsert하고 lastMessageAt desc로 재정렬.
 * @param filterStatus 활성 필터. 지정 시 상태 불일치 항목은 목록에서 제거(탭 이탈).
 */
export function upsertInbox(
  list: InboxItem[],
  incoming: InboxItem,
  filterStatus?: ConversationStatus,
): InboxItem[] {
  const id = incoming.conversation.id;
  const existing = list.find((it) => it.conversation.id === id);
  const without = list.filter((it) => it.conversation.id !== id);

  // 필터가 있고 상태가 어긋나면 목록에서 빠져야 한다(제거만 하고 종료).
  if (filterStatus && incoming.conversation.status !== filterStatus) {
    return without;
  }

  const merged = mergeMemberFields(existing, incoming);
  const next = [...without, merged];
  next.sort((a, b) => sortKey(b) - sortKey(a));
  return next;
}

/** 목록에서 특정 대화 제거. */
export function removeInbox(list: InboxItem[], convId: string): InboxItem[] {
  return list.filter((it) => it.conversation.id !== convId);
}

/**
 * 대화 요약의 상태/모드만 갱신(conversation.updated 수신 시).
 * 목록에 없으면 변화 없음.
 * conversation.updated의 payload는 conversationSchema뿐(favorite/unread/tagIds 없음) —
 * 이 함수는 `conversation` 하위 필드만 치환하므로 기존 항목의 favorite/unread/tagIds는
 * 자동으로 보존된다(멤버별 필드 병합 규칙, upsertInbox의 mergeMemberFields와 동일 취지).
 */
export function patchInboxConversation(
  list: InboxItem[],
  conversation: InboxItem["conversation"],
  filterStatus?: ConversationStatus,
): InboxItem[] {
  const existing = list.find((it) => it.conversation.id === conversation.id);
  if (!existing) return list;
  if (filterStatus && conversation.status !== filterStatus) {
    return removeInbox(list, conversation.id);
  }
  const next = list.map((it) =>
    it.conversation.id === conversation.id ? { ...it, conversation } : it,
  );
  next.sort((a, b) => sortKey(b) - sortKey(a));
  return next;
}
