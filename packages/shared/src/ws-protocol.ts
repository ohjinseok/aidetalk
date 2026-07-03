/**
 * WebSocket 프로토콜 — 04_API_SPEC.md §5.
 * 봉투: `{ type, payload }`. 방향별 discriminated union으로 §5.1~5.4 표의 모든 type을 정의.
 * ⚠️ 알 수 없는 type은 무시(전방 호환) — 게이트웨이는 wsEnvelopeSchema로 느슨히 받고,
 *   방향별 스키마로 좁힌다.
 */
import { z } from "zod";

import {
  conversationSchema,
  conversationSummarySchema,
  messageSchema,
  suggestionSchema,
} from "./entities";

/** 최소 봉투 — type만 확정, payload는 미검증. 알 수 없는 type 필터링용. */
export const wsEnvelopeSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
});
export type WsEnvelope = z.infer<typeof wsEnvelopeSchema>;

/** 메시지 텍스트 제약 — §5.1 message.send, 손님 전송 공통. */
const messageText = z.string().min(1).max(4000);

/** 타이핑 주체 — §5.2 typing.start/stop. */
export const typingBySchema = z.enum(["ai", "human"]);

// ---------- 5.1 위젯 → 서버 ----------
export const widgetToServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.send"),
    payload: z.object({
      conversationId: z.string(),
      clientMsgId: z.string(),
      text: messageText,
    }),
  }),
  z.object({
    type: z.literal("typing.set"),
    payload: z.object({
      conversationId: z.string(),
      isTyping: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("read.mark"),
    payload: z.object({
      conversationId: z.string(),
      lastMessageId: z.string(),
    }),
  }),
]);
export type WidgetToServerMessage = z.infer<typeof widgetToServerMessageSchema>;

// ---------- 5.2 서버 → 위젯 ----------
export const serverToWidgetMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.ack"),
    payload: z.object({
      clientMsgId: z.string(),
      message: messageSchema,
    }),
  }),
  z.object({
    type: z.literal("message.new"),
    payload: z.object({
      message: messageSchema,
    }),
  }),
  z.object({
    type: z.literal("typing.start"),
    payload: z.object({
      conversationId: z.string(),
      by: typingBySchema,
    }),
  }),
  z.object({
    type: z.literal("typing.stop"),
    payload: z.object({
      conversationId: z.string(),
      by: typingBySchema,
    }),
  }),
  z.object({
    type: z.literal("conversation.updated"),
    payload: z.object({
      conversation: conversationSchema,
    }),
  }),
  z.object({
    type: z.literal("error"),
    payload: z.object({
      code: z.string(),
      message: z.string(),
      ref: z.string().optional(),
    }),
  }),
]);
export type ServerToWidgetMessage = z.infer<typeof serverToWidgetMessageSchema>;

// ---------- 5.3 대시보드 → 서버 ----------
export const dashboardToServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe.workspace"),
    payload: z.object({
      workspaceId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("subscribe.conversation"),
    payload: z.object({
      conversationId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("unsubscribe.conversation"),
    payload: z.object({
      conversationId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("typing.set"),
    payload: z.object({
      conversationId: z.string(),
      isTyping: z.boolean(),
    }),
  }),
]);
export type DashboardToServerMessage = z.infer<typeof dashboardToServerMessageSchema>;

// ---------- 5.4 서버 → 대시보드 ----------
export const serverToDashboardMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inbox.upsert"),
    payload: z.object({
      conversationSummary: conversationSummarySchema,
    }),
  }),
  z.object({
    type: z.literal("message.new"),
    payload: z.object({
      message: messageSchema,
    }),
  }),
  z.object({
    type: z.literal("conversation.updated"),
    payload: z.object({
      conversation: conversationSchema,
    }),
  }),
  z.object({
    type: z.literal("handoff.new"),
    payload: z.object({
      conversationSummary: conversationSummarySchema,
      reason: z.string(),
      summary: z.string().nullable(),
    }),
  }),
  z.object({
    // ⚠️ 규칙 9 / §5.5: agent 채널에만 발행. visitor 소켓은 절대 수신하지 않는다.
    type: z.literal("suggestion.new"),
    payload: z.object({
      suggestion: suggestionSchema,
    }),
  }),
  z.object({
    type: z.literal("presence.update"),
    payload: z.object({
      conversationId: z.string(),
      visitorOnline: z.boolean(),
    }),
  }),
]);
export type ServerToDashboardMessage = z.infer<typeof serverToDashboardMessageSchema>;
