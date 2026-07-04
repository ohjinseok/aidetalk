/**
 * 대화 타임라인 병합 — 07_DASHBOARD_SPEC §2.2.
 * messages(말풍선) + conversation_events(회색 시스템 라인)를 시간순으로 병합한다.
 * 순서 규칙(03 §messages): ORDER BY created_at, id. id는 보조키.
 */
import type { Event, Message } from "./api/schemas";

export type TimelineItem =
  | { kind: "message"; id: string; createdAt: string; message: Message }
  | { kind: "event"; id: string; createdAt: string; event: Event };

/** createdAt 오름차순, 동시각이면 id 오름차순으로 안정 정렬. */
export function mergeTimeline(messages: Message[], events: Event[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...messages.map(
      (m): TimelineItem => ({ kind: "message", id: m.id, createdAt: m.createdAt, message: m }),
    ),
    ...events.map(
      (e): TimelineItem => ({ kind: "event", id: e.id, createdAt: e.createdAt, event: e }),
    ),
  ];
  items.sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return items;
}

/**
 * 메시지 배열에 새 메시지를 중복 없이 병합(id 기준). 정렬 유지.
 * WS message.new / 재연결 동기화에서 사용.
 */
export function upsertMessage(list: Message[], incoming: Message): Message[] {
  const idx = list.findIndex((m) => m.id === incoming.id);
  let next: Message[];
  if (idx >= 0) {
    next = list.slice();
    next[idx] = incoming;
  } else {
    next = [...list, incoming];
  }
  next.sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return next;
}
