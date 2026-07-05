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

/** 읽음 표시 주체 — §5 read.update. */
export const readBySchema = z.enum(["visitor", "agent"]);

/**
 * 타이핑 주체 — §5.2/§5.4 typing.start/stop.
 * "visitor"는 손님 타이핑을 상담원 화면에 표시하기 위한 값(§5.4). 게이트웨이는 손님 타이핑을
 * 위젯 소켓에는 되돌려보내지 않는다(위젯 UI는 ai|human만 표시).
 */
export const typingBySchema = z.enum(["ai", "human", "visitor"]);

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
    // 손님 소켓을 이 대화의 conv:all 채널에 구독시킨다(상대 메시지 실시간 수신).
    // message.send로도 암묵 구독되지만, 기존 대화 복원/REST 전송 시엔 이 명시 구독이 필요하다.
    // ⚠️ conv:agents(어시스트)는 절대 구독하지 않는다(규칙 9).
    type: z.literal("conversation.subscribe"),
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
    // 상대(상담원)의 읽음 처리 통지 — 위젯은 by="agent"를 받아 내 마지막 메시지에 "읽음" 표시.
    type: z.literal("read.update"),
    payload: z.object({
      conversationId: z.string(),
      by: readBySchema,
      lastMessageId: z.string(),
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
  z.object({
    // 상담원이 대화를 열람/포커스 → 읽음 처리. 저장 후 손님에게 read.update(by=agent) 브로드캐스트.
    type: z.literal("read.mark"),
    payload: z.object({
      conversationId: z.string(),
      lastMessageId: z.string(),
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
    // 손님/AI/상담원 타이핑 — 대시보드는 by="visitor"만 "입력 중…"으로 표시(§5.4).
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
    // 상대(손님)의 읽음 처리 통지 — 대시보드는 by="visitor"를 받아 상담원 마지막 메시지에 "읽음" 표시.
    type: z.literal("read.update"),
    payload: z.object({
      conversationId: z.string(),
      by: readBySchema,
      lastMessageId: z.string(),
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
