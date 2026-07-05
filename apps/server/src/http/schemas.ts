/**
 * REST 요청 본문 zod 스키마 — 04_API_SPEC.md §1, §2.
 *
 * NOTE(decision): §6 공유 객체(응답 형태)는 packages/shared가 단일 출처지만,
 *   요청 본문 스키마는 아직 shared에 없다. 위젯/대시보드가 병렬 작업 중이라
 *   이번 웨이브에서는 서버 로컬에 두고, 계약이 안정되면 packages/shared로 승격한다.
 */
import { z } from "zod";

// ---------- 위젯 API (§1) ----------
export const sessionRequestSchema = z.object({
  workspaceId: z.string().min(1),
  existingToken: z.string().optional(),
  pageUrl: z.string().optional(),
  referrer: z.string().optional(),
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
  segment: z.enum(["s1_site", "s2_no_site"]).default("s1_site"),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

/** PATCH /v1/workspaces/:wsId/settings — owner만(§2). */
export const updateWorkspaceSettingsRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    widgetSettings: z.record(z.unknown()).optional(),
    attributionRule: z.enum(["last_click", "first_click"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "변경할 항목이 필요하다." });
export type UpdateWorkspaceSettingsRequest = z.infer<typeof updateWorkspaceSettingsRequestSchema>;

// ---------- 멤버/초대 (§2) ----------
export const inviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "agent_member"]).default("agent_member"),
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

// ---------- 위젯 핸드오프 (§1) ----------
export const widgetHandoffRequestSchema = z.object({
  conversationId: z.string().min(1),
});
export type WidgetHandoffRequest = z.infer<typeof widgetHandoffRequestSchema>;

// ---------- 웹훅 (§2 웹훅 섹션, Should) ----------
/** 04 §2 웹훅 이벤트 목록. 새 이벤트 추가 시 여기와 04 문서를 함께 갱신한다. */
export const webhookEventNames = ["agent.auto_disabled", "conversation.handoff"] as const;
export type WebhookEventName = (typeof webhookEventNames)[number];

export const createWebhookRequestSchema = z.object({
  url: z.string().min(1),
  events: z.array(z.enum(webhookEventNames)).min(1),
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
