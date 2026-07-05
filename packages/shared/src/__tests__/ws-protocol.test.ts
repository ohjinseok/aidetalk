import { describe, expect, it } from "vitest";

import {
  dashboardToServerMessageSchema,
  serverToDashboardMessageSchema,
  serverToWidgetMessageSchema,
  widgetToServerMessageSchema,
  wsEnvelopeSchema,
} from "../ws-protocol";

const sampleMessage = {
  id: "msg_1",
  conversationId: "conv_1",
  role: "visitor",
  authorId: "vis_1",
  content: { type: "text", text: "안녕" },
  createdAt: "2026-06-12T09:00:00Z",
};

const sampleConversation = {
  id: "conv_1",
  workspaceId: "ws_1",
  visitorId: "vis_1",
  status: "open",
  mode: "ai",
  assigneeId: null,
  lastMessageAt: "2026-06-12T09:00:00Z",
  metadata: {},
  createdAt: "2026-06-12T09:00:00Z",
};

const sampleSummary = {
  conversation: sampleConversation,
  visitor: { id: "vis_1", name: null, email: null },
  lastMessage: { textPreview: "안녕", role: "visitor", createdAt: "2026-06-12T09:00:00Z" },
};

describe("wsEnvelopeSchema", () => {
  it("type만 있으면 통과(전방 호환)", () => {
    expect(wsEnvelopeSchema.safeParse({ type: "unknown.future", payload: { x: 1 } }).success).toBe(
      true,
    );
  });
});

describe("위젯 → 서버 (§5.1)", () => {
  it("message.send 파싱", () => {
    expect(
      widgetToServerMessageSchema.safeParse({
        type: "message.send",
        payload: { conversationId: "conv_1", clientMsgId: "c1", text: "배송?" },
      }).success,
    ).toBe(true);
  });

  it("text 4000자 초과 거부", () => {
    expect(
      widgetToServerMessageSchema.safeParse({
        type: "message.send",
        payload: { conversationId: "conv_1", clientMsgId: "c1", text: "가".repeat(4001) },
      }).success,
    ).toBe(false);
  });

  it("알 수 없는 type 거부(discriminated union)", () => {
    expect(
      widgetToServerMessageSchema.safeParse({ type: "message.nope", payload: {} }).success,
    ).toBe(false);
  });

  it("read.mark / typing.set 파싱", () => {
    expect(
      widgetToServerMessageSchema.safeParse({
        type: "read.mark",
        payload: { conversationId: "conv_1", lastMessageId: "msg_1" },
      }).success,
    ).toBe(true);
    expect(
      widgetToServerMessageSchema.safeParse({
        type: "typing.set",
        payload: { conversationId: "conv_1", isTyping: true },
      }).success,
    ).toBe(true);
  });
});

describe("서버 → 위젯 (§5.2)", () => {
  it("message.ack / message.new / typing / conversation.updated / error 파싱", () => {
    const cases = [
      { type: "message.ack", payload: { clientMsgId: "c1", message: sampleMessage } },
      { type: "message.new", payload: { message: sampleMessage } },
      { type: "typing.start", payload: { conversationId: "conv_1", by: "ai" } },
      { type: "typing.stop", payload: { conversationId: "conv_1", by: "human" } },
      { type: "conversation.updated", payload: { conversation: sampleConversation } },
      {
        type: "read.update",
        payload: { conversationId: "conv_1", by: "agent", lastMessageId: "msg_1" },
      },
      { type: "error", payload: { code: "rate/limited", message: "느려요" } },
    ];
    for (const c of cases) {
      expect(serverToWidgetMessageSchema.safeParse(c).success).toBe(true);
    }
  });
});

describe("대시보드 → 서버 (§5.3)", () => {
  it("subscribe/unsubscribe/typing 파싱", () => {
    const cases = [
      { type: "subscribe.workspace", payload: { workspaceId: "ws_1" } },
      { type: "subscribe.conversation", payload: { conversationId: "conv_1" } },
      { type: "unsubscribe.conversation", payload: { conversationId: "conv_1" } },
      { type: "typing.set", payload: { conversationId: "conv_1", isTyping: false } },
      { type: "read.mark", payload: { conversationId: "conv_1", lastMessageId: "msg_1" } },
    ];
    for (const c of cases) {
      expect(dashboardToServerMessageSchema.safeParse(c).success).toBe(true);
    }
  });
});

describe("서버 → 대시보드 (§5.4)", () => {
  it("모든 type 파싱", () => {
    const cases = [
      { type: "inbox.upsert", payload: { conversationSummary: sampleSummary } },
      { type: "message.new", payload: { message: sampleMessage } },
      { type: "conversation.updated", payload: { conversation: sampleConversation } },
      {
        type: "handoff.new",
        payload: { conversationSummary: sampleSummary, reason: "환불", summary: null },
      },
      {
        type: "suggestion.new",
        payload: {
          suggestion: {
            id: "asg_1",
            conversationId: "conv_1",
            triggerMessageId: "msg_1",
            draft: "제안",
            rationale: null,
            actions: null,
            source: "agent",
            outcome: "pending",
            createdAt: "2026-06-12T09:00:00Z",
          },
        },
      },
      { type: "presence.update", payload: { conversationId: "conv_1", visitorOnline: true } },
      { type: "typing.start", payload: { conversationId: "conv_1", by: "visitor" } },
      { type: "typing.stop", payload: { conversationId: "conv_1", by: "visitor" } },
      {
        type: "read.update",
        payload: { conversationId: "conv_1", by: "visitor", lastMessageId: "msg_1" },
      },
    ];
    for (const c of cases) {
      expect(serverToDashboardMessageSchema.safeParse(c).success).toBe(true);
    }
  });
});
