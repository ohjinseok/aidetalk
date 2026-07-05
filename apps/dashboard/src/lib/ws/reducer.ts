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
 * 목록에 요약을 upsert하고 lastMessageAt desc로 재정렬.
 * @param filterStatus 활성 필터. 지정 시 상태 불일치 항목은 목록에서 제거(탭 이탈).
 */
export function upsertInbox(
  list: InboxItem[],
  incoming: InboxItem,
  filterStatus?: ConversationStatus,
): InboxItem[] {
  const id = incoming.conversation.id;
  const without = list.filter((it) => it.conversation.id !== id);

  // 필터가 있고 상태가 어긋나면 목록에서 빠져야 한다(제거만 하고 종료).
  if (filterStatus && incoming.conversation.status !== filterStatus) {
    return without;
  }

  const next = [...without, incoming];
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
