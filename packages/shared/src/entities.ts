/**
 * 공유 객체 형태 — 04_API_SPEC.md §6 (shared zod와 1:1).
 * 내부 API 계약이므로 JSON 필드는 camelCase.
 * 시간은 전부 ISO 8601 UTC 문자열.
 */
import { z } from "zod";

/** 메시지 role — 03 문서 messages.role. */
export const messageRoleSchema = z.enum(["visitor", "agent_ai", "agent_human", "system"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/** 메시지 content — 03 문서 messages.content(jsonb). 현재는 text 타입만. */
export const messageContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  quickReplies: z.array(z.string()).optional(),
});
export type MessageContent = z.infer<typeof messageContentSchema>;

/** Message — 04 §6. */
export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: messageRoleSchema,
  authorId: z.string().nullable(), // system은 null
  content: messageContentSchema,
  createdAt: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

/** 대화 상태/모드 — 03 문서 conversations. */
export const conversationStatusSchema = z.enum(["open", "pending", "closed"]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const conversationModeSchema = z.enum(["ai", "human"]);
export type ConversationMode = z.infer<typeof conversationModeSchema>;

/** Conversation — 04 §6. */
export const conversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  visitorId: z.string(),
  status: conversationStatusSchema,
  mode: conversationModeSchema,
  assigneeId: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  // 양방향 읽음 표시(read receipts) — 각 주체가 읽은 마지막 메시지 id. 03 conversations.
  // 전방호환을 위해 optional(구버전 응답 허용). 값 없으면 null.
  visitorLastReadMessageId: z.string().nullable().optional(),
  agentLastReadMessageId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/** ConversationSummary — 04 §6. 인박스 목록/알림용 경량 요약. */
export const conversationSummarySchema = z.object({
  conversation: conversationSchema,
  visitor: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  lastMessage: z
    .object({
      textPreview: z.string(),
      role: messageRoleSchema,
      createdAt: z.string(),
    })
    .nullable(),
  // 아래 두 필드는 상담원 전용 인박스 부가 정보. WS inbox.upsert/handoff.new가 자동으로 실어 나른다.
  // ⚠️ conversationSchema(위젯도 받는 스키마)에는 넣지 않는다 — 태그/미열람 수는 상담원 전용 정보(규칙 9 취지).
  unread: z.number().optional(),
  tagIds: z.array(z.string()).optional(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** 태그 색상 팔레트 — 인박스 태그 UI(07 문서). */
export const tagColorSchema = z.enum([
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
]);
export type TagColor = z.infer<typeof tagColorSchema>;

/** Tag — 워크스페이스 단위 인박스 태그. */
export const tagSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  color: tagColorSchema,
  createdAt: z.string(),
});
export type Tag = z.infer<typeof tagSchema>;

/** ConversationNote — 상담원 메모. authorName은 users 조인 표시용(불확실 → optional). */
export const conversationNoteSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  authorId: z.string(),
  authorName: z.string().nullable().optional(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationNote = z.infer<typeof conversationNoteSchema>;

/** 어시스트 제안 소스/결과 — 03 문서 assist_suggestions. */
export const suggestionSourceSchema = z.enum(["agent", "builtin"]);
export const suggestionOutcomeSchema = z.enum(["pending", "accepted", "edited", "ignored"]);

/** 제안 액션 항목. */
export const suggestionActionSchema = z.object({
  label: z.string(),
  url: z.string(),
});

/**
 * Suggestion — 04 §6.
 * ⚠️ CLAUDE.md 규칙 9: 이 객체는 상담원 전용. visitor 세션/토큰으로 절대 조회 불가.
 */
export const suggestionSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  triggerMessageId: z.string(),
  draft: z.string(),
  rationale: z.string().nullable(),
  actions: z.array(suggestionActionSchema).nullable(),
  source: suggestionSourceSchema,
  outcome: suggestionOutcomeSchema,
  createdAt: z.string(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

/** 대화 이벤트 타입 — 03 문서 conversation_events.type. */
export const eventTypeSchema = z.enum([
  "handoff_auto", // 에이전트 실패로 인한 자동 핸드오프
  "handoff_agent", // 에이전트 handoff 응답
  "handoff_requested", // 손님 요청 버튼
  "returned_to_ai",
  "assigned",
  "unassigned",
  "closed",
  "reopened",
  "pending", // 보류 전환
]);
export type EventType = z.infer<typeof eventTypeSchema>;

/** Event — 04 §6. actor는 'system' | 'agent:{id}' | 'user:{id}' | 'visitor:{id}'. */
export const eventSchema = z.object({
  id: z.string(),
  type: eventTypeSchema,
  actor: z.string(),
  payload: z.record(z.unknown()),
  createdAt: z.string(),
});
export type Event = z.infer<typeof eventSchema>;
