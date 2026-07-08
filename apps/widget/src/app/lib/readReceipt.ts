/**
 * 위젯 읽음 표시(read receipts) 계산 — 06 §2.
 * 순수 로직은 @aidetalk/shared(read-receipt)로 승격됨 — 여기서는 손님측(visitor) 관점으로 감싼다.
 * 상담원이 읽은 마지막 메시지가 내(손님) 마지막 메시지 이상이면 그 손님 메시지 id를 반환.
 */
import { readReceiptMsgId as compute } from "@aidetalk/shared";

import type { Message } from "../shared";

export function readReceiptMsgId(
  confirmed: Message[],
  agentLastReadMessageId: string | null,
): string | null {
  return compute(confirmed, agentLastReadMessageId, "visitor");
}
