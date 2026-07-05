/**
 * 위젯 읽음 표시(read receipts) 계산 — 06 §2 (테스트 대상 순수 로직).
 * 상담원이 읽은 마지막 메시지(read.update by="agent")의 created_at이 내(손님) 마지막 메시지 이상이면
 * 그 손님 메시지 id를 반환("읽음" 표시 대상). msg id는 단조 아님 → created_at으로 비교.
 */
import type { Message } from "../shared";

export function readReceiptMsgId(
  confirmed: Message[],
  agentLastReadMessageId: string | null,
): string | null {
  if (!agentLastReadMessageId) return null;
  const readMsg = confirmed.find((m) => m.id === agentLastReadMessageId);
  if (!readMsg) return null;
  let lastVisitor: Message | null = null;
  for (const m of confirmed) {
    if (m.role === "visitor") lastVisitor = m;
  }
  if (!lastVisitor) return null;
  return new Date(readMsg.createdAt).getTime() >= new Date(lastVisitor.createdAt).getTime()
    ? lastVisitor.id
    : null;
}
