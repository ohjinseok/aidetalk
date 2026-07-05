/**
 * 도메인 이벤트 → PubSub 채널 발행(04_API_SPEC.md §5.4/§5.5).
 * WS Gateway가 채널을 구독해 자격에 맞는 소켓에만 fan-out한다.
 *
 * ⚠️ suggestion.new는 conv:{id}:agents 채널로만 발행 — visitor 소켓은 이 채널을 절대
 *   구독하지 않으므로 손님에게 도달하지 않는다(CLAUDE.md 규칙 9 / 08 §3 불변식 3).
 */
import type {
  Conversation,
  ConversationSummary,
  Message,
  PubSubAdapter,
  Suggestion,
} from "@aidetalk/shared";

import { channels } from "./pubsub/channels";

export interface Broadcaster {
  messageNew(conversationId: string, message: Message): Promise<void>;
  conversationUpdated(conversation: Conversation): Promise<void>;
  typing(conversationId: string, by: "ai" | "human" | "visitor", isTyping: boolean): Promise<void>;
  /** 읽음 표시 통지 — conv:all 채널(위젯+대시보드 공용). 04 §5. */
  readUpdate(
    conversationId: string,
    by: "visitor" | "agent",
    lastMessageId: string,
  ): Promise<void>;
  inboxUpsert(workspaceId: string, summary: ConversationSummary): Promise<void>;
  /** 핸드오프 알림 — ws:{id}:inbox 채널(agent 소켓 전용). 브라우저 알림 트리거(§5.4). */
  handoffNew(
    workspaceId: string,
    summary: ConversationSummary,
    reason: string,
    handoffSummary: string | null,
  ): Promise<void>;
  /** ⚠️ agents 채널 전용. */
  suggestionNew(conversationId: string, suggestion: Suggestion): Promise<void>;
}

function envelope(type: string, payload: unknown): string {
  return JSON.stringify({ type, payload });
}

export function createBroadcaster(pubsub: PubSubAdapter): Broadcaster {
  return {
    async messageNew(conversationId, message) {
      await pubsub.publish(channels.convAll(conversationId), envelope("message.new", { message }));
    },
    async conversationUpdated(conversation) {
      await pubsub.publish(
        channels.convAll(conversation.id),
        envelope("conversation.updated", { conversation }),
      );
    },
    async typing(conversationId, by, isTyping) {
      await pubsub.publish(
        channels.convAll(conversationId),
        envelope(isTyping ? "typing.start" : "typing.stop", { conversationId, by }),
      );
    },
    async readUpdate(conversationId, by, lastMessageId) {
      await pubsub.publish(
        channels.convAll(conversationId),
        envelope("read.update", { conversationId, by, lastMessageId }),
      );
    },
    async inboxUpsert(workspaceId, summary) {
      await pubsub.publish(
        channels.wsInbox(workspaceId),
        envelope("inbox.upsert", { conversationSummary: summary }),
      );
    },
    async handoffNew(workspaceId, summary, reason, handoffSummary) {
      await pubsub.publish(
        channels.wsInbox(workspaceId),
        envelope("handoff.new", {
          conversationSummary: summary,
          reason,
          summary: handoffSummary,
        }),
      );
    },
    async suggestionNew(conversationId, suggestion) {
      await pubsub.publish(
        channels.convAgents(conversationId),
        envelope("suggestion.new", { suggestion }),
      );
    },
  };
}
