/**
 * 타입 세이프 엔드포인트 함수 — 04_API_SPEC.md §2 계약과 1:1.
 * 라우트/컴포넌트는 fetch를 직접 부르지 않고 이 함수만 사용한다.
 */
import {
  agentLogSchema,
  agentSchema,
  agentTestResultSchema,
  agentWithSecretSchema,
  authResponseSchema,
  conversationDetailSchema,
  conversationResponseSchema,
  conversationTagIdsResponseSchema,
  conversationTrackingSchema,
  inboxCountsSchema,
  inboxItemSchema,
  inviteResponseSchema,
  listEnvelope,
  meSchema,
  memberSchema,
  messageResponseSchema,
  messageSchema,
  noteResponseSchema,
  notesListResponseSchema,
  secretOnlySchema,
  suggestionSchema,
  tagResponseSchema,
  tagsListResponseSchema,
  trackingSummarySchema,
  visitorResponseSchema,
  webhookSchema,
  webhookWithSecretSchema,
  workspaceResponseSchema,
  type Agent,
  type AgentLog,
  type AgentUpdateVisitorRequest,
  type AttributionRule,
  type Conversation,
  type ConversationDetail,
  type ConversationNote,
  type CreateNoteRequest,
  type CreateTagRequest,
  type InboxCounts,
  type InboxItem,
  type Me,
  type Member,
  type Message,
  type Role,
  type Segment,
  type Suggestion,
  type Tag,
  type TrackingSummary,
  type UpdateNoteRequest,
  type UpdateTagRequest,
  type VisitorDetail,
  type Webhook,
  type WebhookEventName,
  type WidgetSettings,
  type Workspace,
} from "@aidetalk/shared";
import { z } from "zod";

import { apiFetch, type ApiFetchOptions } from "./client";

/**
 * 쿼리스트링 빌드 헬퍼 — undefined/null/빈 문자열 값은 생략한다.
 * 값이 하나도 없으면 빈 문자열, 있으면 "?a=1&b=2" 형태를 반환(그대로 경로에 이어붙임).
 */
function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const q = qs.toString();
  return q ? `?${q}` : "";
}

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
    apiFetch(`/v1/workspaces/${wsId}/agents`, listEnvelope(agentSchema), opts).then((r) => r.items),
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
    const query = buildQuery({ agentId: params.agentId, cursor: params.cursor });
    return apiFetch(
      `/v1/workspaces/${wsId}/agent-logs${query}`,
      listEnvelope(agentLogSchema),
      opts,
    );
  },
};

// ---------- 인박스 ----------
export const inboxApi = {
  list: (
    wsId: string,
    params: {
      status?: string;
      cursor?: string;
      q?: string;
      /** 담당자 필터 — userId 또는 "none"(미배정). */
      assigneeId?: string;
      tagId?: string;
      unread?: boolean;
      favorite?: boolean;
    },
    opts?: ApiFetchOptions,
  ): Promise<{ items: InboxItem[]; nextCursor: string | null }> => {
    const query = buildQuery({
      status: params.status,
      cursor: params.cursor,
      q: params.q,
      assigneeId: params.assigneeId,
      tagId: params.tagId,
      unread: params.unread ? 1 : undefined,
      favorite: params.favorite ? 1 : undefined,
    });
    return apiFetch(
      `/v1/workspaces/${wsId}/conversations${query}`,
      listEnvelope(inboxItemSchema),
      opts,
    );
  },
  /** 인박스 필터 탭/사이드바 카운트 집계. */
  counts: (wsId: string, opts?: ApiFetchOptions): Promise<InboxCounts> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/counts`, inboxCountsSchema, opts),
  get: (wsId: string, convId: string, opts?: ApiFetchOptions): Promise<ConversationDetail> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}`, conversationDetailSchema, opts),
  messages: (
    wsId: string,
    convId: string,
    params: { after?: string; limit?: number },
    opts?: ApiFetchOptions,
  ): Promise<{ items: Message[]; nextCursor: string | null }> => {
    const query = buildQuery({ after: params.after, limit: params.limit });
    return apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/messages${query}`,
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
  hold: (wsId: string, convId: string): Promise<Conversation> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}/hold`, conversationResponseSchema, {
      method: "POST",
    }).then((r) => r.conversation),
  /** 즐겨찾기 설정/해제 — on이면 PUT, 아니면 DELETE. */
  setFavorite: (wsId: string, convId: string, on: boolean): Promise<boolean> =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/favorite`,
      z.object({ favorite: z.boolean() }),
      { method: on ? "PUT" : "DELETE" },
    ).then((r) => r.favorite),
  addTag: (wsId: string, convId: string, tagId: string): Promise<string[]> =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/tags`,
      conversationTagIdsResponseSchema,
      { method: "POST", body: { tagId } },
    ).then((r) => r.tagIds),
  removeTag: (wsId: string, convId: string, tagId: string): Promise<string[]> =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/tags/${tagId}`,
      conversationTagIdsResponseSchema,
      { method: "DELETE" },
    ).then((r) => r.tagIds),
};

// ---------- 인박스 태그 ----------
export const tagApi = {
  list: (wsId: string, opts?: ApiFetchOptions): Promise<Tag[]> =>
    apiFetch(`/v1/workspaces/${wsId}/tags`, tagsListResponseSchema, opts).then((r) => r.items),
  create: (wsId: string, body: CreateTagRequest): Promise<Tag> =>
    apiFetch(`/v1/workspaces/${wsId}/tags`, tagResponseSchema, { method: "POST", body }).then(
      (r) => r.tag,
    ),
  update: (wsId: string, tagId: string, body: UpdateTagRequest): Promise<Tag> =>
    apiFetch(`/v1/workspaces/${wsId}/tags/${tagId}`, tagResponseSchema, {
      method: "PATCH",
      body,
    }).then((r) => r.tag),
  remove: (wsId: string, tagId: string): Promise<void> =>
    apiFetch(`/v1/workspaces/${wsId}/tags/${tagId}`, null, { method: "DELETE" }),
};

// ---------- 상담 메모 ----------
export const noteApi = {
  list: (wsId: string, convId: string, opts?: ApiFetchOptions): Promise<ConversationNote[]> =>
    apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/notes`,
      notesListResponseSchema,
      opts,
    ).then((r) => r.items),
  create: (wsId: string, convId: string, body: CreateNoteRequest): Promise<ConversationNote> =>
    apiFetch(`/v1/workspaces/${wsId}/conversations/${convId}/notes`, noteResponseSchema, {
      method: "POST",
      body,
    }).then((r) => r.note),
  update: (wsId: string, noteId: string, body: UpdateNoteRequest): Promise<ConversationNote> =>
    apiFetch(`/v1/workspaces/${wsId}/notes/${noteId}`, noteResponseSchema, {
      method: "PATCH",
      body,
    }).then((r) => r.note),
  remove: (wsId: string, noteId: string): Promise<void> =>
    apiFetch(`/v1/workspaces/${wsId}/notes/${noteId}`, null, { method: "DELETE" }),
};

// ---------- 방문자 ----------
export const visitorApi = {
  // PII 파기(익명화) — owner만. 되돌릴 수 없음(08 §6). 응답 본문은 사용하지 않아 파싱 생략.
  deletePii: (wsId: string, visitorId: string): Promise<void> =>
    apiFetch(`/v1/workspaces/${wsId}/visitors/${visitorId}/pii`, null, { method: "DELETE" }),
  // 방문자 정보 수정 — 상담원 전용(04 §2).
  update: (
    wsId: string,
    visitorId: string,
    patch: AgentUpdateVisitorRequest,
  ): Promise<VisitorDetail> =>
    apiFetch(`/v1/workspaces/${wsId}/visitors/${visitorId}`, visitorResponseSchema, {
      method: "PATCH",
      body: patch,
    }).then((r) => r.visitor),
  // 같은 방문자의 다른 대화 목록 — 정보 패널 "이전 대화" 표시용.
  conversations: (
    wsId: string,
    visitorId: string,
    opts?: ApiFetchOptions,
  ): Promise<{ items: InboxItem[] }> =>
    apiFetch(
      `/v1/workspaces/${wsId}/visitors/${visitorId}/conversations`,
      z.object({ items: z.array(inboxItemSchema) }),
      opts,
    ),
};

// ---------- 어시스트 (상담원 전용 — 규칙 9) ----------
export const assistApi = {
  list: (
    wsId: string,
    convId: string,
    params: { after?: string },
    opts?: ApiFetchOptions,
  ): Promise<{ items: Suggestion[]; nextCursor: string | null }> => {
    const query = buildQuery({ after: params.after });
    return apiFetch(
      `/v1/workspaces/${wsId}/conversations/${convId}/suggestions${query}`,
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
    const query = buildQuery({ from: params.from, to: params.to });
    return apiFetch(`/v1/workspaces/${wsId}/tracking/summary${query}`, trackingSummarySchema, opts);
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
