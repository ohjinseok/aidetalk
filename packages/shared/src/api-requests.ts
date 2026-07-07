/**
 * REST 요청 본문 계약 zod 스키마 — 04_API_SPEC.md §1, §2, §3.
 * 서버(요청 검증)·위젯/대시보드(요청 조립)가 모두 이 스키마를 단일 출처로 import한다.
 * (CLAUDE.md 코딩 컨벤션: API 계약은 packages/shared의 zod가 단일 출처)
 *
 * 도메인 enum(segment/role/attributionRule/웹훅 이벤트)은 api-responses.ts 정본을 재사용한다.
 */
import { z } from "zod";

import { tagColorSchema } from "./entities";
import {
  attributionRuleSchema,
  roleSchema,
  segmentSchema,
  webhookEventNameSchema,
} from "./api-responses";

// ---------- 위젯 API (§1) ----------
export const sessionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  existingToken: z.string().optional(),
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
  // 위젯이 navigator.language / Intl.DateTimeFormat().resolvedOptions().timeZone으로 보내는 값.
  locale: z.string().max(35).optional(),
  timezone: z.string().max(64).optional(),
});
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const createConversationRequestSchema = z.object({
  pageUrl: z.string().optional(),
});
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const profilePatchRequestSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((v) => v.email !== undefined || v.name !== undefined, {
    message: "email 또는 name 중 하나는 필요하다.",
  });
export type ProfilePatchRequest = z.infer<typeof profilePatchRequestSchema>;

/** long-poll 폴백 전송(§1 마지막 줄) — WS message.send와 동일 처리. */
export const longPollSendRequestSchema = z.object({
  clientMsgId: z.string().min(1),
  text: z.string().min(1).max(4000),
});
export type LongPollSendRequest = z.infer<typeof longPollSendRequestSchema>;

// ---------- 인증/계정 (§2) ----------
export const signupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "비밀번호는 최소 8자."), // 08 §3
  name: z.string().min(1),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// ---------- 워크스페이스 (§2) ----------
export const createWorkspaceRequestSchema = z.object({
  name: z.string().min(1),
  segment: segmentSchema.default("s1_site"),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

/** PATCH /v1/workspaces/:wsId/settings — owner만(§2). */
export const updateWorkspaceSettingsRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    widgetSettings: z.record(z.unknown()).optional(),
    attributionRule: attributionRuleSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "변경할 항목이 필요하다." });
export type UpdateWorkspaceSettingsRequest = z.infer<typeof updateWorkspaceSettingsRequestSchema>;

// ---------- 멤버/초대 (§2) ----------
export const inviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: roleSchema.default("agent_member"),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const acceptInviteRequestSchema = z.object({
  inviteToken: z.string().min(1),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

// ---------- Agent 커넥터 (§2) ----------
export const createAgentRequestSchema = z.object({
  name: z.string().min(1),
  endpointUrl: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
});
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;

export const updateAgentRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    endpointUrl: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(1000).max(120000).optional(),
    assistEnabled: z.boolean().optional(),
    // status는 active|disabled만 사용자 지정 가능(auto_disabled는 시스템 전용).
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "변경할 항목이 필요하다." });
export type UpdateAgentRequest = z.infer<typeof updateAgentRequestSchema>;

// ---------- 인박스 (§2) ----------
export const inboxSendMessageRequestSchema = z.object({
  text: z.string().min(1).max(4000),
});
export type InboxSendMessageRequest = z.infer<typeof inboxSendMessageRequestSchema>;

export const assignConversationRequestSchema = z.object({
  userId: z.string().min(1).nullable(),
});
export type AssignConversationRequest = z.infer<typeof assignConversationRequestSchema>;

export const patchSuggestionRequestSchema = z.object({
  outcome: z.enum(["accepted", "edited", "ignored"]),
});
export type PatchSuggestionRequest = z.infer<typeof patchSuggestionRequestSchema>;

// ---------- 인박스 태그 (§2) ----------
export const createTagRequestSchema = z.object({
  name: z.string().min(1).max(50),
  color: tagColorSchema.default("gray"),
});
export type CreateTagRequest = z.infer<typeof createTagRequestSchema>;

export const updateTagRequestSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    color: tagColorSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.color !== undefined, {
    message: "name 또는 color 중 하나는 필요하다.",
  });
export type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>;

export const setConversationTagRequestSchema = z.object({
  tagId: z.string().min(1),
});
export type SetConversationTagRequest = z.infer<typeof setConversationTagRequestSchema>;

// ---------- 상담 메모 (§2) ----------
export const createNoteRequestSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const updateNoteRequestSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;

// ---------- 방문자 정보 수정 (§2, 상담원 전용) ----------
export const agentUpdateVisitorRequestSchema = z
  .object({
    name: z.string().max(100).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.phone !== undefined, {
    message: "name, email, phone 중 하나는 필요하다.",
  });
export type AgentUpdateVisitorRequest = z.infer<typeof agentUpdateVisitorRequestSchema>;

// ---------- 위젯 핸드오프 (§1) ----------
export const widgetHandoffRequestSchema = z.object({
  conversationId: z.string().min(1),
});
export type WidgetHandoffRequest = z.infer<typeof widgetHandoffRequestSchema>;

// ---------- 웹훅 (§2 웹훅 섹션, Should) ----------
export const createWebhookRequestSchema = z.object({
  url: z.string().min(1),
  events: z.array(webhookEventNameSchema).min(1),
});
export type CreateWebhookRequest = z.infer<typeof createWebhookRequestSchema>;

// ---------- 트래킹 엔드포인트 (§3, 무인증) ----------
// ⚠️ /t/*는 검증 실패도 204로 감춘다(라우트에서 safeParse로 처리, validateJson 미들웨어 미사용).
export const trackClickRequestSchema = z.object({
  token: z.string().min(1),
});
export type TrackClickRequest = z.infer<typeof trackClickRequestSchema>;

export const trackConversionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  externalRef: z.string().min(1).optional(),
  amount: z.number().finite().optional(),
  currency: z.string().min(1).optional(),
  occurredAt: z.string().optional(),
  visitorToken: z.string().optional(),
});
export type TrackConversionRequest = z.infer<typeof trackConversionRequestSchema>;
