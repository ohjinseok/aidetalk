/**
 * 대시보드 API 응답 스키마 — 04_API_SPEC.md §2 계약 기준.
 *
 * 원칙: packages/shared에 있는 계약(Message/Conversation/ConversationSummary/Suggestion/Event)은
 * 그대로 재사용한다. shared에 아직 없는 대시보드 전용 응답 형태(워크스페이스/멤버/에이전트/로그/트래킹)만
 * 여기서 로컬로 정의한다.
 *
 * TODO(question): 워크스페이스/에이전트/멤버 zod 스키마는 원래 packages/shared가 단일 출처여야 한다
 * (widget-settings.ts 등). 인박스·agents API를 병렬 구현 중인 에이전트와의 충돌을 피하려고
 * 지금은 대시보드 로컬에 두었다. 통합 웨이브에서 shared로 승격 필요.
 *
 * 서버가 추가 필드를 보내더라도 zod 기본 동작(미지정 키 제거)으로 무시되므로, 여기서는 화면이
 * 필요로 하는 최소 필드만 정의하고 불확실한 필드는 optional/nullable로 둔다.
 */
import {
  conversationSchema,
  conversationSummarySchema,
  eventSchema,
  messageSchema,
  // widgetSettings 정본은 shared로 승격됨(widget-settings.ts) — 대시보드는 이를 재사용한다.
  launcherPositionSchema,
  officeHoursRuleSchema,
  officeHoursSchema,
  widgetSettingsSchema,
  widgetToneSchema,
  type LauncherPosition,
  type OfficeHoursRule,
  type WidgetSettings,
} from "@aidetalk/shared";
import { z } from "zod";

// ---------- 리스트 봉투 (04 §0) ----------
export function listEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

// ---------- 계정/세션 ----------
export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  createdAt: z.string().optional(),
});
export type User = z.infer<typeof userSchema>;

export const roleSchema = z.enum(["owner", "agent_member"]);
export type Role = z.infer<typeof roleSchema>;

export const membershipSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  role: roleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

export const meSchema = z.object({
  user: userSchema,
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;

export const authResponseSchema = z.object({ user: userSchema });

// ---------- 워크스페이스 / 위젯 설정 ----------
export const segmentSchema = z.enum(["s1_site", "s2_no_site"]);
export type Segment = z.infer<typeof segmentSchema>;

export const attributionRuleSchema = z.enum(["last_click", "first_click"]);
export type AttributionRule = z.infer<typeof attributionRuleSchema>;

// widgetSettings 계약(tone/launcherPosition/officeHours/widgetSettings)은 shared 정본을 재노출한다.
export const toneSchema = widgetToneSchema;
export type Tone = z.infer<typeof toneSchema>;
export { launcherPositionSchema, officeHoursRuleSchema, officeHoursSchema, widgetSettingsSchema };
export type { LauncherPosition, OfficeHoursRule, WidgetSettings };

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  segment: segmentSchema,
  plan: z.string(),
  widgetSettings: widgetSettingsSchema,
  attributionRule: attributionRuleSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceResponseSchema = z.object({ workspace: workspaceSchema });

// ---------- 멤버 ----------
export const memberSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string(),
  role: roleSchema,
  status: z.enum(["invited", "active"]),
  // 서버가 users 조인으로 내려줄 수 있는 표시용 필드(불확실 → optional)
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type Member = z.infer<typeof memberSchema>;

/** 미가입 이메일 초대 행(invites 테이블) — 04 §2. */
export const inviteSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string(),
  role: roleSchema,
  status: z.literal("invited"),
  expiresAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Invite = z.infer<typeof inviteSchema>;

/**
 * POST /members 응답 — 04 §2.
 * 기가입이면 member(invited) 반환, 미가입이면 member=null + invite(이메일 초대 행).
 * 두 경우 모두 inviteUrl(/invites/accept?token=) 제공.
 */
export const inviteResponseSchema = z.object({
  member: memberSchema.nullable().optional(),
  invite: inviteSchema.optional(),
  inviteUrl: z.string(),
});

// ---------- 에이전트 커넥터 ----------
export const agentStatusSchema = z.enum(["active", "disabled", "auto_disabled"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  endpointUrl: z.string(),
  status: agentStatusSchema,
  failureCount: z.number(),
  timeoutMs: z.number(),
  assistEnabled: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Agent = z.infer<typeof agentSchema>;

/** 생성/재발급 응답 — secret 원문은 이 응답 1회만 (04 §2). */
export const agentWithSecretSchema = z.object({
  agent: agentSchema,
  secret: z.string(),
});
export const secretOnlySchema = z.object({ secret: z.string() });

export const agentTestResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().optional(),
  response: z.unknown().optional(),
  error: z.string().optional(),
});
export type AgentTestResult = z.infer<typeof agentTestResultSchema>;

// ---------- AI 로그 ----------
export const agentLogModeSchema = z.enum(["reply", "assist"]);
export const agentLogOutcomeSchema = z.enum([
  "reply",
  "handoff",
  "noop",
  "suggest",
  "timeout",
  "error",
]);
export type AgentLogOutcome = z.infer<typeof agentLogOutcomeSchema>;

export const agentLogSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  conversationId: z.string(),
  messageId: z.string().nullable().optional(),
  mode: agentLogModeSchema,
  requestSummary: z.unknown(),
  responseSummary: z.unknown().nullable().optional(),
  outcome: agentLogOutcomeSchema,
  createdAt: z.string(),
});
export type AgentLog = z.infer<typeof agentLogSchema>;

// ---------- 인박스 ----------
/** 목록 항목 — ConversationSummary + unread?(04 §2). */
export const inboxItemSchema = conversationSummarySchema.extend({
  unread: z.number().optional(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

/** 방문자 상세 — 대화 상세/정보 패널용. 불확실 필드는 optional. */
export const visitorDetailSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
  firstReferrer: z.string().nullable().optional(),
  firstPageUrl: z.string().nullable().optional(),
});
export type VisitorDetail = z.infer<typeof visitorDetailSchema>;

/** 대화 상세 — 04 §2: { conversation, visitor, events }. */
export const conversationDetailSchema = z.object({
  conversation: conversationSchema,
  visitor: visitorDetailSchema,
  events: z.array(eventSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const conversationResponseSchema = z.object({ conversation: conversationSchema });
export const messageResponseSchema = z.object({ message: messageSchema });

// ---------- 트래킹 ----------
export const trackingSummarySchema = z.object({
  conversationCount: z.number(),
  linkedConversations: z.number(),
  clickedConversations: z.number(),
  attributedRevenueKrw: z.number(),
  bySource: z.object({
    click_only: z.number(),
    pixel: z.number(),
  }),
});
export type TrackingSummary = z.infer<typeof trackingSummarySchema>;

export const conversationTrackingSchema = z.object({
  trackedLinks: z.array(
    z.object({
      id: z.string(),
      targetUrl: z.string(),
      clickedAt: z.string().nullable(),
      messageId: z.string().nullable().optional(),
    }),
  ),
  conversions: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      amount: z.number().nullable(),
      occurredAt: z.string(),
    }),
  ),
});
export type ConversationTracking = z.infer<typeof conversationTrackingSchema>;

// ---------- 웹훅(Should, 04 §2 웹훅 섹션) ----------
export const webhookEventNameSchema = z.enum(["agent.auto_disabled", "conversation.handoff"]);
export type WebhookEventName = z.infer<typeof webhookEventNameSchema>;

export const webhookSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  url: z.string(),
  events: z.array(webhookEventNameSchema),
  status: z.enum(["active", "disabled"]),
  createdAt: z.string().optional(),
});
export type Webhook = z.infer<typeof webhookSchema>;

/** 등록 응답 — secret 원문은 이 응답 1회만(04 §2). */
export const webhookWithSecretSchema = z.object({
  webhook: webhookSchema,
  secret: z.string(),
});

// re-export 자주 쓰는 shared 타입
export { messageSchema, conversationSchema, eventSchema, conversationSummarySchema };
export type { Message, Conversation, Event, ConversationSummary, Suggestion } from "@aidetalk/shared";
