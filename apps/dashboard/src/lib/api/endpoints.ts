/**
 * 타입 세이프 엔드포인트 함수 — 04_API_SPEC.md §2 계약과 1:1.
 * 라우트/컴포넌트는 fetch를 직접 부르지 않고 이 함수만 사용한다.
 */
import { messageSchema, suggestionSchema, type Suggestion } from "@aidetalk/shared";
import { z } from "zod";

import { apiFetch, type ApiFetchOptions } from "./client";
import {
  agentLogSchema,
  agentSchema,
  agentTestResultSchema,
  agentWithSecretSchema,
  authResponseSchema,
  conversationDetailSchema,
  conversationResponseSchema,
  conversationTrackingSchema,
  inboxItemSchema,
  inviteResponseSchema,
  listEnvelope,
  meSchema,
  memberSchema,
  messageResponseSchema,
  secretOnlySchema,
  trackingSummarySchema,
  webhookSchema,
  webhookWithSecretSchema,
  workspaceResponseSchema,
  type Agent,
  type AgentLog,
  type AttributionRule,
  type Conversation,
  type ConversationDetail,
  type InboxItem,
  type Me,
  type Member,
  type Message,
  type Role,
  type Segment,
  type TrackingSummary,
  type Webhook,
  type WebhookEventName,
  type WidgetSettings,
  type Workspace,
} from "./schemas";

// ---------- 인증/계정 ----------
export const authApi = {
  signup: (body: { email: string; password: string; name: string }) =>
    apiFetch("/v1/auth/signup", authResponseSchema, { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    apiFetch("/v1/auth/login", authResponseSchema, { method: "POST", body }),
  logout: () => apiFetch("/v1/auth/logout", null, { method: "POST" }),
  me: (opts?: ApiFetchOptions): Promise<Me> => apiFetch("/v1/me", meSchema, opts),
};

// ---------- 워크스페이스/멤버 ----------
export const workspaceApi = {
  create: (body: { name: string; segment: Segment }): Promise<Workspace> =>
    apiFetch("/v1/workspaces", workspaceResponseSchema, { method: "POST", body }).then(
      (r) => r.workspace,
    ),
  get: (wsId: string, opts?: ApiFetchOptions): Promise<Workspace> =>
    apiFetch(`/v1/workspaces/${wsId}`, workspaceResponseSchema, opts).then((r) => r.workspace),
  updateSettings: (
    wsId: string,
    body: { name?: string; widgetSettings?: WidgetSettings; attributionRule?: AttributionRule },
  ): Promise<Workspace> =>
    apiFetch(`/v1/workspaces/${wsId}/settings`, workspaceResponseSchema, {
      method: "PATCH",
      body,
    }).then((r) => r.workspace),
};

export const memberApi = {
  list: (wsId: string, opts?: ApiFetchOptions): Promise<Member[]> =>
    apiFetch(`/v1/workspaces/${wsId}/members`, listEnvelope(memberSchema), opts).then(
      (r) => r.items,
    ),
  invite: (wsId: string, body: { email: string; role: Role }) =>
    apiFetch(`/v1/workspaces/${wsId}/members`, inviteResponseSchema, { method: "POST", body }),
  remove: (wsId: string, memberId: string) =>
    apiFetch(`/v1/workspaces/${wsId}/members/${memberId}`, null, { method: "DELETE" }),
  acceptInvite: (inviteToken: string) =>
    apiFetch("/v1/invites/accept", z.object({ member: memberSchema }), {
      method: "POST",
      body: { inviteToken },
    }),
};

// ---------- 에이전트 커넥터 ----------
export const agentApi = {
  list: (wsId: string, opts?: ApiFetchOptions): Promise<Agent[]> =>
    apiFetch(`/v1/workspaces/${wsId}/agents`, listEnvelope(agentSchema), opts).then(
      (r) => r.items,
    ),
  create: (wsId: string, body: { name: string; endpointUrl: string; timeoutMs?: number }) =>
    apiFetch(`/v1/workspaces/${wsId}/agents`, agentWithSecretSchema, { method: "POST", body }),
  update: (
    wsId: string,
    agentId: string,
    body: {
      name?: string;
      endpointUrl?: string;
      timeoutMs?: number;
      assistEnabled?: boolean;
      status?: "active" | "disabled";
    },
  ): Promise<Agent> =>
    apiFetch(`/v1/workspaces/${wsId}/agents/${agentId}`, agentSchema, { method: "PATCH", body }),
  rotateSecret: (wsId: string, agentId: string) =>
    apiFetch(`/v1/workspaces/${wsId}/agents/${agentId}/rotate-secret`, secretOnlySchema, {
      method: "POST",
    }),
  test: (wsId: string, agentId: string) =>
    apiFetch(`/v1/workspaces/${wsId}/agents/${agentId}/test`, agentTestResultSchema, {
      method: "POST",
    }),
  logs: (
    wsId: string,
    params: { agentId?: string; cursor?: string },
    opts?: ApiFetchOptions,
  ): Promise<{ items: AgentLog[]; nextCursor: string | null }> => {
    const qs = new URLSearchParams();
    if (params.agentId) qs.set("agentId", params.agentId);
    if (params.cursor) qs.set("cursor", params.cursor);
    const q = qs.toString();
    return apiFetch(
      `/v1/workspaces/${wsId}/agent-logs${q ? `?${q}` : ""}`,
      listEnvelope(agentLogSchema),
      opts,
    );
  },
};

// ---------- 인박스 ----------
export const inboxApi = {
  list: (
    wsId: string,
    params: { status?: string; cursor?: string; q?: string },
    opts?: ApiFetchOptions,
  ): Promise<{ items: InboxItem[]; nextCursor: string | null }> => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.q) qs.set("q", params.q);
    const q = qs.toString();
    return apiFetch(
      `/v1/workspaces/${wsId}/conversations${q ? `?${q}` : ""}`,
      listEnvelope(inboxItemSchema),
      opts,
    );
  },
  get: (wsId: string, convId: string, opts?: ApiFetchOptions): Promise<ConversationDetail> =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}`,
      conversationDetailSchema,
      opts,
    ),
  messages: (
    wsId: string,
    convId: string,
    params: { after?: string; limit?: number },
    opts?: ApiFetchOptions,
  ): Promise<{ items: Message[]; nextCursor: string | null }> => {
    const qs = new URLSearchParams();
    if (params.after) qs.set("after", params.after);
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/messages${q ? `?${q}` : ""}`,
      listEnvelope(messageSchema),
      opts,
    );
  },
  sendMessage: (wsId: string, convId: string, text: string): Promise<Message> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}/messages`, messageResponseSchema, {
      method: "POST",
      body: { text },
    }).then((r) => r.message),
  assign: (wsId: string, convId: string, userId: string | null): Promise<Conversation> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}/assign`, conversationResponseSchema, {
      method: "POST",
      body: { userId },
    }).then((r) => r.conversation),
  returnToAi: (wsId: string, convId: string): Promise<Conversation> =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/return-to-ai`,
      conversationResponseSchema,
      { method: "POST" },
    ).then((r) => r.conversation),
  close: (wsId: string, convId: string): Promise<Conversation> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}/close`, conversationResponseSchema, {
      method: "POST",
    }).then((r) => r.conversation),
  reopen: (wsId: string, convId: string): Promise<Conversation> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}/reopen`, conversationResponseSchema, {
      method: "POST",
    }).then((r) => r.conversation),
};

// ---------- 어시스트 (상담원 전용 — 규칙 9) ----------
export const assistApi = {
  list: (
    wsId: string,
    convId: string,
    params: { after?: string },
    opts?: ApiFetchOptions,
  ): Promise<{ items: Suggestion[]; nextCursor: string | null }> => {
    const qs = new URLSearchParams();
    if (params.after) qs.set("after", params.after);
    const q = qs.toString();
    return apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/suggestions${q ? `?${q}` : ""}`,
      listEnvelope(suggestionSchema),
      opts,
    );
  },
  setOutcome: (
    wsId: string,
    suggestionId: string,
    outcome: "accepted" | "edited" | "ignored",
  ): Promise<Suggestion> =>
    apiFetch(
      `/v1/workspaces/${wsId}/suggestions/${suggestionId}`,
      z.object({ suggestion: suggestionSchema }),
      { method: "PATCH", body: { outcome } },
    ).then((r) => r.suggestion),
};

// ---------- 트래킹 (S1 전용) ----------
export const trackingApi = {
  summary: (
    wsId: string,
    params: { from?: string; to?: string },
    opts?: ApiFetchOptions,
  ): Promise<TrackingSummary> => {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    const q = qs.toString();
    return apiFetch(
      `/v1/workspaces/${wsId}/tracking/summary${q ? `?${q}` : ""}`,
      trackingSummarySchema,
      opts,
    );
  },
  conversation: (wsId: string, convId: string, opts?: ApiFetchOptions) =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/tracking`,
      conversationTrackingSchema,
      opts,
    ),
};

// ---------- 웹훅(Should) ----------
export const webhookApi = {
  list: (wsId: string, opts?: ApiFetchOptions): Promise<Webhook[]> =>
    apiFetch(`/v1/workspaces/${wsId}/webhooks`, listEnvelope(webhookSchema), opts).then(
      (r) => r.items,
    ),
  create: (wsId: string, body: { url: string; events: WebhookEventName[] }) =>
    apiFetch(`/v1/workspaces/${wsId}/webhooks`, webhookWithSecretSchema, { method: "POST", body }),
  remove: (wsId: string, webhookId: string) =>
    apiFetch(`/v1/workspaces/${wsId}/webhooks/${webhookId}`, null, { method: "DELETE" }),
};

export type { AttributionRule };
