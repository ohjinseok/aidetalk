/**
 * 대시보드 읽음 표시 계산 단위 테스트 — 07 §2.
 * 손님 읽음 커서 기준으로 상담원(agent_human/agent_ai) 마지막 메시지에 "읽음" 표시 여부.
 */
import { describe, expect, it } from "vitest";

import type { Message } from "@aidetalk/shared";

import { readReceiptMsgId } from "../readReceipt";

function msg(id: string, role: Message["role"], createdAt: string): Message {
  return {
    id,
    conversationId: "conv_1",
    role,
    authorId: null,
    content: { type: "text", text: id },
    createdAt,
  };
}

describe("readReceiptMsgId (dashboard)", () => {
  const v1 = msg("msg_a", "visitor", "2026-06-12T09:00:00.000Z");
  const agent1 = msg("msg_b", "agent_human", "2026-06-12T09:01:00.000Z");
  const v2 = msg("msg_c", "visitor", "2026-06-12T09:02:00.000Z");
  const all = [v1, agent1, v2];

  it("읽음 커서 없음 → null", () => {
    expect(readReceiptMsgId(all, null)).toBeNull();
  });

  it("손님이 상담원 마지막 메시지 이후를 읽음 → 그 상담원 메시지 id", () => {
    // 손님이 v2(agent1 이후)를 읽음 → agent1 읽은 것으로.
    expect(readReceiptMsgId(all, "msg_c")).toBe("msg_b");
  });

  it("손님이 상담원 메시지 이전까지만 읽음 → null", () => {
    // 손님이 v1(agent1 이전)까지만 읽음.
    expect(readReceiptMsgId(all, "msg_a")).toBeNull();
  });

  it("상담원 메시지가 없으면 null", () => {
    expect(readReceiptMsgId([v1, v2], "msg_c")).toBeNull();
  });

  it("agent_ai 메시지도 대상", () => {
    const ai = msg("msg_d", "agent_ai", "2026-06-12T09:03:00.000Z");
    const list = [...all, ai];
    expect(readReceiptMsgId(list, "msg_d")).toBe("msg_d");
  });
});
