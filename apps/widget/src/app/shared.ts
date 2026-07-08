/**
 * @aidetalk/shared 재노출 배럴 — 위젯 전역이 계약을 한 곳에서 가져오게 한다.
 *
 * WS 봉투/엔티티와 위젯 REST 응답 스키마는 모두 packages/shared의 zod가 단일 출처
 * (CLAUDE.md 코딩 컨벤션). 위젯 REST 응답 스키마는 widget-api.ts로 승격됨 — 여기선 재노출만.
 */
export {
  serverToWidgetMessageSchema,
  visitorSchema,
  sessionResponseSchema,
  createConversationResponseSchema,
  messagesListSchema,
  postMessageResponseSchema,
  profileResponseSchema,
} from "@aidetalk/shared";
export type {
  Message,
  ServerToWidgetMessage,
  Visitor,
  SessionResponse,
  CreateConversationResponse,
  MessagesList,
} from "@aidetalk/shared";
