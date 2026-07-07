/**
 * DB row → 04_API_SPEC.md §6 공유 객체(shared zod) 직렬화.
 * 시간은 전부 ISO 8601 UTC 문자열로 변환(04 §0).
 */
import type {
  Conversation,
  ConversationMode,
  ConversationStatus,
  Event,
  EventType,
  Message,
  MessageContent,
  MessageRole,
  Suggestion,
} from "@aidetalk/shared";

/** messages row → Message. */
export function serializeMessage(row: {
  id: string;
  conversationId: string;
  role: string;
  authorId: string | null;
  content: MessageContent;
  createdAt: Date | string;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    authorId: row.authorId,
    content: row.content,
    createdAt: toIso(row.createdAt),
  };
}

/** conversations row → Conversation. */
export function serializeConversation(row: {
  id: string;
  workspaceId: string;
  visitorId: string;
  status: string;
  mode: string;
  assigneeId: string | null;
  lastMessageAt: Date | string | null;
  visitorLastReadMessageId?: string | null;
  agentLastReadMessageId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date | string;
}): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    visitorId: row.visitorId,
    status: row.status as ConversationStatus,
    mode: row.mode as ConversationMode,
    assigneeId: row.assigneeId,
    lastMessageAt: row.lastMessageAt ? toIso(row.lastMessageAt) : null,
    visitorLastReadMessageId: row.visitorLastReadMessageId ?? null,
    agentLastReadMessageId: row.agentLastReadMessageId ?? null,
    metadata: row.metadata,
    createdAt: toIso(row.createdAt),
  };
}

/** assist_suggestions row → Suggestion(04 §6). ⚠️ 상담원 전용 객체(규칙 9). */
export function serializeSuggestion(row: {
  id: string;
  conversationId: string;
  triggerMessageId: string;
  draft: string;
  rationale: string | null;
  actions: { label: string; url: string }[] | null;
  source: string;
  outcome: string;
  createdAt: Date | string;
}): Suggestion {
  return {
    id: row.id,
    conversationId: row.conversationId,
    triggerMessageId: row.triggerMessageId,
    draft: row.draft,
    rationale: row.rationale,
    actions: row.actions,
    source: row.source as Suggestion["source"],
    outcome: row.outcome as Suggestion["outcome"],
    createdAt: toIso(row.createdAt),
  };
}

/** conversation_events row → Event(04 §6). */
export function serializeEvent(row: {
  id: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
}): Event {
  return {
    id: row.id,
    type: row.type as EventType,
    actor: row.actor,
    payload: row.payload,
    createdAt: toIso(row.createdAt),
  };
}

/** agents row → 공개 Agent 객체. ⚠️ secretHash/secretEnc는 절대 포함하지 않는다(규칙 5). */
export function serializeAgent(row: {
  id: string;
  workspaceId: string;
  name: string;
  endpointUrl: string;
  status: string;
  failureCount: number;
  timeoutMs: number;
  assistEnabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    endpointUrl: row.endpointUrl,
    status: row.status,
    failureCount: row.failureCount,
    timeoutMs: row.timeoutMs,
    assistEnabled: row.assistEnabled,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** agent_logs row → 공개 로그 객체(요약만, 시크릿 없음). */
export function serializeAgentLog(row: {
  id: string;
  agentId: string;
  conversationId: string;
  messageId: string | null;
  mode: string;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown> | null;
  outcome: string;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    agentId: row.agentId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    mode: row.mode,
    requestSummary: row.requestSummary,
    responseSummary: row.responseSummary,
    outcome: row.outcome,
    createdAt: toIso(row.createdAt),
  };
}

/** tracked_links row → 대화 트래킹 상세 항목(04 §2). */
export function serializeTrackedLink(row: {
  id: string;
  targetUrl: string;
  clickedAt: Date | string | null;
  messageId: string | null;
}) {
  return {
    id: row.id,
    targetUrl: row.targetUrl,
    clickedAt: row.clickedAt ? toIso(row.clickedAt) : null,
    messageId: row.messageId,
  };
}

/** conversions row → 대화 트래킹 상세 항목(04 §2). ⚠️ 규칙 10: amount는 "기여 추정" 맥락에서만 노출. */
export function serializeConversionEvent(row: {
  id: string;
  source: string;
  amount: number | null;
  occurredAt: Date | string;
}) {
  return {
    id: row.id,
    source: row.source,
    amount: row.amount,
    occurredAt: toIso(row.occurredAt),
  };
}

/** webhooks row → 공개 Webhook 객체. ⚠️ secretHash/secretEnc는 절대 포함하지 않는다(규칙 5). */
export function serializeWebhook(row: {
  id: string;
  workspaceId: string;
  url: string;
  events: string[];
  status: string;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    url: row.url,
    events: row.events,
    status: row.status,
    createdAt: toIso(row.createdAt),
  };
}

/** visitors row → 상담원 인박스용 공개 방문자 객체(04 §6, shared visitorDetailSchema 정합). */
export function publicVisitor(v: {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  attributes: Record<string, unknown>;
  firstPageUrl: string | null;
  firstReferrer: string | null;
  locale: string | null;
  timezone: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
}) {
  return {
    id: v.id,
    email: v.email,
    name: v.name,
    phone: v.phone,
    attributes: v.attributes,
    firstPageUrl: v.firstPageUrl,
    firstReferrer: v.firstReferrer,
    locale: v.locale,
    timezone: v.timezone,
    createdAt: v.createdAt.toISOString(),
    lastSeenAt: v.lastSeenAt ? v.lastSeenAt.toISOString() : null,
  };
}

/** users row → 공개 사용자 객체. ⚠️ passwordHash는 절대 포함하지 않는다(규칙 5). */
export function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

/** members row → 공개 멤버 객체. */
export function serializeMember(row: {
  id: string;
  userId: string;
  role: string;
  status: string;
  email?: string;
  name?: string;
  createdAt?: Date | string;
}) {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    status: row.status,
    email: row.email ?? null,
    name: row.name ?? null,
    createdAt: row.createdAt != null ? toIso(row.createdAt) : null,
  };
}

/** invites row → 공개 초대 객체(token_hash는 절대 노출 금지, 규칙 5). */
export function serializeInvite(row: {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  expiresAt: Date | string;
  acceptedAt: Date | string | null;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    status: "invited" as const,
    expiresAt: toIso(row.expiresAt),
    acceptedAt: row.acceptedAt ? toIso(row.acceptedAt) : null,
    createdAt: toIso(row.createdAt),
  };
}

/** workspaces row → 공개 워크스페이스 객체. */
export function serializeWorkspace(row: {
  id: string;
  name: string;
  segment: string;
  plan: string;
  widgetSettings: Record<string, unknown>;
  attributionRule: string;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    plan: row.plan,
    widgetSettings: row.widgetSettings,
    attributionRule: row.attributionRule,
    createdAt: toIso(row.createdAt),
  };
}

/** 메시지 미리보기 텍스트(인박스 요약용). */
export function messagePreview(content: MessageContent): string {
  return content.text.slice(0, 140);
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
