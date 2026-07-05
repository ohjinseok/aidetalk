/**
 * 위젯 읽음 표시 계산 단위 테스트 — 06 §2.
 * created_at 비교(id 단조 아님) + 손님 마지막 메시지 대상.
 */
import { describe, expect, it } from "vitest";

import { readReceiptMsgId } from "../app/lib/readReceipt";
import type { Message } from "../app/shared";

function msg(id: string, role: Message["role"], createdAt: string): Message {
  return { id, conversationId: "conv_1", role, authorId: null, content: { type: "text", text: id }, createdAt };
}

describe("readReceiptMsgId (widget)", () => {
  const v1 = msg("msg_a", "visitor", "2026-06-12T09:00:00.000Z");
  const a1 = msg("msg_b", "agent_human", "2026-06-12T09:01:00.000Z");
  const v2 = msg("msg_c", "visitor", "2026-06-12T09:02:00.000Z");
  const all = [v1, a1, v2];

  it("읽은 메시지 없음 → null", () => {
    expect(readReceiptMsgId(all, null)).toBeNull();
  });

  it("상담원이 내 마지막 메시지를 읽음 → 그 손님 메시지 id", () => {
    // agent가 v2(내 마지막)를 읽음.
    expect(readReceiptMsgId(all, "msg_c")).toBe("msg_c");
  });

  it("상담원이 읽은 메시지가 내 마지막보다 이전이면 표시 안 함(null)", () => {
    // agent가 a1까지만 읽음(v2 이전) → v2는 아직 안 읽음.
    expect(readReceiptMsgId(all, "msg_b")).toBeNull();
  });

  it("id 사전순과 무관하게 created_at 기준(단조 아님 대응)", () => {
    // id는 사전순으로 v_zzz < 읽음 대상이지만 created_at은 더 큼.
    const late = msg("msg_aaa", "visitor", "2026-06-12T10:00:00.000Z");
    const readCursor = msg("msg_zzz", "visitor", "2026-06-12T10:00:00.000Z");
    // 상담원이 readCursor(같은 시각)를 읽음 → late도 읽은 것으로.
    expect(readReceiptMsgId([late, readCursor], "msg_zzz")).toBe("msg_zzz");
  });

  it("손님 메시지가 하나도 없으면 null", () => {
    expect(readReceiptMsgId([a1], "msg_b")).toBeNull();
  });
});
