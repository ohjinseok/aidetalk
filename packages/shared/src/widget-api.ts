/**
 * 위젯 REST 응답 계약 zod 스키마 — 04_API_SPEC.md §1 (위젯 API) 기준.
 * 위젯(응답 파싱)이 단일 출처로 import한다. 서버 측 채택은 후속 웨이브.
 * (CLAUDE.md 코딩 컨벤션: API 계약은 packages/shared의 zod가 단일 출처)
 *
 * §6 공유 객체(Message/Conversation)와 widgetSettings는 각각 entities.ts /
 * widget-settings.ts가 정본이므로 여기서는 재사용만 한다(pick/listEnvelope).
 */
import { z } from "zod";

import { listEnvelope } from "./api-responses";
import { conversationSchema, messageSchema } from "./entities";
import { evaluatedWidgetSettingsSchema } from "./widget-settings";

/** 방문자 요약 — 04 §1 session/profile 응답. 위젯이 받는 최소 방문자 형태. */
export const visitorSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
});
export type Visitor = z.infer<typeof visitorSchema>;

/** POST /v1/widget/session 응답 — 04 §1. */
export const sessionResponseSchema = z.object({
  visitorToken: z.string(),
  visitor: visitorSchema,
  /** 헤더 표기용 워크스페이스 이름. */
  workspaceName: z.string(),
  widgetSettings: evaluatedWidgetSettingsSchema,
  openConversationId: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** POST /v1/widget/conversations 응답 — 04 §1. conversation 정본에서 필요한 필드만 pick. */
export const createConversationResponseSchema = z.object({
  conversation: conversationSchema.pick({ id: true, mode: true, status: true }),
});
export type CreateConversationResponse = z.infer<typeof createConversationResponseSchema>;

/** GET .../messages 응답 — 04 §1 (리스트 봉투 04 §0). */
export const messagesListSchema = listEnvelope(messageSchema);
export type MessagesList = z.infer<typeof messagesListSchema>;

/** POST .../messages (폴백 전송) 응답 — { message }. */
export const postMessageResponseSchema = z.object({
  message: messageSchema,
});

/** PATCH /v1/widget/profile 응답 — 04 §1 (병합 시 새 토큰). */
export const profileResponseSchema = z.object({
  visitorToken: z.string(),
  visitor: visitorSchema,
});
