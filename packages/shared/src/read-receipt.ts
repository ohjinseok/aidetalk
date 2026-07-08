/**
 * 읽음 표시(read receipts) 계산 — 06 §2(위젯) / 07 §2(대시보드)의 대칭 로직 단일화.
 * 상대가 읽은 마지막 메시지의 created_at이 "내" 마지막 메시지 이상이면 그 내 메시지 id를 반환
 * ("읽음" 표시 대상). msg id는 단조 아님 → created_at으로 비교.
 *
 * 손님측(위젯)은 상담원 읽음 커서로 내(손님) 마지막 메시지를,
 * 상담원측(대시보드)은 손님 읽음 커서로 상담원(agent_ai/agent_human) 마지막 메시지를 대상으로 한다.
 */
import type { Message } from "./entities";

/** "내" 메시지 기준 — visitor(위젯) | agent(대시보드). */
export type ReadReceiptSide = "visitor" | "agent";

function isOwnMessage(role: Message["role"], side: ReadReceiptSide): boolean {
  return side === "visitor"
    ? role === "visitor"
    : role === "agent_human" || role === "agent_ai";
}

/**
 * @param messages 시간순 메시지 목록
 * @param readCursorMessageId 상대가 읽은 마지막 메시지 id(없으면 null)
 * @param side "내" 메시지 판정 기준
 */
export function readReceiptMsgId(
  messages: Message[],
  readCursorMessageId: string | null,
  side: ReadReceiptSide,
): string | null {
  if (!readCursorMessageId) return null;
  const readMsg = messages.find((m) => m.id === readCursorMessageId);
  if (!readMsg) return null;
  let lastOwn: Message | null = null;
  for (const m of messages) {
    if (isOwnMessage(m.role, side)) lastOwn = m;
  }
  if (!lastOwn) return null;
  return new Date(readMsg.createdAt).getTime() >= new Date(lastOwn.createdAt).getTime()
    ? lastOwn.id
    : null;
}
