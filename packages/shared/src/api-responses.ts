/**
 * REST 응답 계약 zod 스키마 — 04_API_SPEC.md §2 (대시보드 API) 기준.
 * 서버(응답 직렬화)·대시보드(응답 파싱)가 모두 이 스키마를 단일 출처로 import한다.
 * (CLAUDE.md 코딩 컨벤션: API 계약은 packages/shared의 zod가 단일 출처)
 *
 * §6 공유 객체(Message/Conversation/ConversationSummary/Suggestion/Event)와 widgetSettings는
 * 각각 entities.ts / widget-settings.ts가 정본이므로 여기서는 재사용만 한다.
 * 서버가 추가 필드를 보내더라도 zod 기본 동작(미지정 키 제거)으로 무시되므로, 화면이 필요로 하는
 * 최소 필드만 정의하고 불확실한 필드는 optional/nullable로 둔다.
 */
import { z } from "zod";

import {
  conversationNoteSchema,
  conversationSchema,
  conversationSummarySchema,
  eventSchema,
  messageSchema,
  tagSchema,
} from "./entities";
import { widgetSettingsSchema } from "./widget-settings";

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
/** 목록 항목 — ConversationSummary + favorite?(04 §2). unread/tagIds는 conversationSummary 정본 필드. */
export const inboxItemSchema = conversationSummarySchema.extend({
  favorite: z.boolean().optional(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

/** 인박스 필터 탭/사이드바용 카운트 집계 — 04 §2. */
export const inboxCountsSchema = z.object({
  mine: z.number(),
  all: z.number(),
  unread: z.number(),
  favorites: z.number(),
  unassigned: z.number(),
  byAssignee: z.array(
    z.object({
      assigneeId: z.string(),
      count: z.number(),
    }),
  ),
  byTag: z.array(
    z.object({
      tagId: z.string(),
      count: z.number(),
    }),
  ),
});
export type InboxCounts = z.infer<typeof inboxCountsSchema>;

/** 방문자 상세 — 대화 상세/정보 패널용. 불확실 필드는 optional. */
export const visitorDetailSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  attributes: z.record(z.unknown()).optional(),
  firstReferrer: z.string().nullable().optional(),
  firstPageUrl: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});
export type VisitorDetail = z.infer<typeof visitorDetailSchema>;

export const visitorResponseSchema = z.object({ visitor: visitorDetailSchema });

/** 대화 상세 — 04 §2: { conversation, visitor, events } + favorite?/tagIds?(인박스 확장). */
export const conversationDetailSchema = z.object({
  conversation: conversationSchema,
  visitor: visitorDetailSchema,
  events: z.array(eventSchema),
  favorite: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const conversationResponseSchema = z.object({ conversation: conversationSchema });
export const messageResponseSchema = z.object({ message: messageSchema });

// ---------- 인박스 태그 ----------
export const tagResponseSchema = z.object({ tag: tagSchema });
export const tagsListResponseSchema = z.object({ items: z.array(tagSchema) });
export const conversationTagIdsResponseSchema = z.object({ tagIds: z.array(z.string()) });

// ---------- 상담 메모 ----------
export const noteResponseSchema = z.object({ note: conversationNoteSchema });
export const notesListResponseSchema = z.object({ items: z.array(conversationNoteSchema) });

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
/** 04 §2 웹훅 이벤트 목록. 새 이벤트 추가 시 여기와 04 문서를 함께 갱신한다. */
export const webhookEventNames = ["agent.auto_disabled", "conversation.handoff"] as const;
export const webhookEventNameSchema = z.enum(webhookEventNames);
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
