/**
 * AideTalk → Agent 요청 본문 조립 — 05_AGENT_PROTOCOL.md "요청".
 * history: 최근 20개, 오래된 것부터, 현재 message 미포함(snake_case 외부 계약).
 */
import type { AgentMode, AgentRequest, Conversation, Message } from "@aidetalk/shared";

/** history 최대 개수 — 05 문서. */
export const HISTORY_LIMIT = 20;

export interface BuildAgentRequestInput {
  mode: AgentMode;
  conversation: Conversation;
  /** 트리거된 현재 손님 메시지. */
  message: Message;
  /** 대화의 최근 메시지들(오래된→최신, 현재 메시지 포함 가능 — 여기서 제외 처리). */
  recentMessages: Message[];
  visitor: {
    id: string;
    email: string | null;
    name: string | null;
    attributes: Record<string, unknown>;
    firstPageUrl: string | null;
  };
  workspaceId: string;
  /** 워크스페이스 설정에서 유저가 정의한 임의 metadata(에이전트에 그대로 전달). */
  workspaceMetadata: Record<string, unknown>;
}

/** protocol message로 변환(role은 DB role과 1:1). */
function toProtocolMessage(m: Message) {
  return {
    id: m.id,
    role: m.role,
    text: m.content.text,
    created_at: m.createdAt,
  };
}

export function buildAgentRequest(input: BuildAgentRequestInput): AgentRequest {
  const history = input.recentMessages
    .filter((m) => m.id !== input.message.id) // 현재 메시지 제외
    .slice(-HISTORY_LIMIT) // 최근 20개(오래된 것부터)
    .map(toProtocolMessage);

  const pageUrl =
    (input.conversation.metadata.startPageUrl as string | undefined) ??
    input.visitor.firstPageUrl ??
    "";

  return {
    version: "1",
    mode: input.mode,
    conversation_id: input.conversation.id,
    message: toProtocolMessage(input.message),
    history,
    visitor: {
      id: input.visitor.id,
      email: input.visitor.email,
      name: input.visitor.name,
      attributes: input.visitor.attributes,
      page_url: pageUrl,
    },
    workspace: {
      id: input.workspaceId,
      metadata: input.workspaceMetadata,
    },
  };
}
