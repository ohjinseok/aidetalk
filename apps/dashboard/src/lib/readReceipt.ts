/**
 * 대시보드 읽음 표시(read receipts) 계산 — 07 §2.
 * 순수 로직은 @aidetalk/shared(read-receipt)로 승격됨 — 여기서는 상담원측(agent) 관점으로 감싼다.
 * 손님이 읽은 마지막 메시지가 상담원(agent_human/agent_ai) 마지막 메시지 이상이면 그 id를 반환.
 */
import { readReceiptMsgId as compute, type Message } from "@aidetalk/shared";

export function readReceiptMsgId(
  messages: Message[],
  visitorLastReadMessageId: string | null,
): string | null {
  return compute(messages, visitorLastReadMessageId, "agent");
}
