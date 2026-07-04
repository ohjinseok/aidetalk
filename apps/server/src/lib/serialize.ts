/**
 * DB row → 04_API_SPEC.md §6 공유 객체(shared zod) 직렬화.
 * 시간은 전부 ISO 8601 UTC 문자열로 변환(04 §0).
 */
import type {
  Conversation,
  ConversationMode,
  ConversationStatus,
  Message,
  MessageContent,
  MessageRole,
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
    metadata: row.metadata,
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
