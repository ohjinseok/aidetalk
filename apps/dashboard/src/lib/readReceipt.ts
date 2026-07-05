/**
 * 대시보드 읽음 표시(read receipts) 계산 — 07 §2 (테스트 대상 순수 로직).
 * 손님이 읽은 마지막 메시지(read.update by="visitor")의 created_at이 상담원 마지막 메시지 이상이면
 * 그 상담원 메시지 id를 반환("읽음" 표시 대상). msg id는 단조 아님 → created_at으로 비교.
 */
import type { Message } from "@aidetalk/shared";

function isAgentMessage(role: Message["role"]): boolean {
  return role === "agent_human" || role === "agent_ai";
}

export function readReceiptMsgId(
  messages: Message[],
  visitorLastReadMessageId: string | null,
): string | null {
  if (!visitorLastReadMessageId) return null;
  const readMsg = messages.find((m) => m.id === visitorLastReadMessageId);
  if (!readMsg) return null;
  let lastAgent: Message | null = null;
  for (const m of messages) {
    if (isAgentMessage(m.role)) lastAgent = m;
  }
  if (!lastAgent) return null;
  return new Date(readMsg.createdAt).getTime() >= new Date(lastAgent.createdAt).getTime()
    ? lastAgent.id
    : null;
}
