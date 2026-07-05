/**
 * @aidetalk/shared 재노출 + 위젯 API 응답 스키마.
 *
 * WS 봉투/엔티티는 packages/shared의 zod가 단일 출처(CLAUDE.md 코딩 컨벤션) — 여기서 재사용한다.
 * REST 응답 형태는 04_API_SPEC.md §1을 그대로 zod로 옮긴다.
 */
import { z } from "zod";

import {
  messageSchema,
  serverToWidgetMessageSchema,
  type Message,
  type ServerToWidgetMessage,
} from "@aidetalk/shared";

import { widgetSettingsSchema } from "./types";

export { serverToWidgetMessageSchema };
export type { Message, ServerToWidgetMessage };

/** 방문자 요약 — 04 §1 session/profile 응답. shared에 정본이 없어 위젯 로컬 정의. */
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
  widgetSettings: widgetSettingsSchema,
  openConversationId: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** POST /v1/widget/conversations 응답 — 04 §1. */
export const createConversationResponseSchema = z.object({
  conversation: z.object({
    id: z.string(),
    mode: z.enum(["ai", "human"]),
    status: z.enum(["open", "pending", "closed"]),
  }),
});
export type CreateConversationResponse = z.infer<typeof createConversationResponseSchema>;

/** GET .../messages 응답 — 04 §1 (리스트 봉투 04 §0). */
export const messagesListSchema = z.object({
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
});
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
