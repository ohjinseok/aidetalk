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
  typing(conversationId: string, by: "ai" | "human", isTyping: boolean): Promise<void>;
  inboxUpsert(workspaceId: string, summary: ConversationSummary): Promise<void>;
  presence(conversationId: string, visitorOnline: boolean): Promise<void>;
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
    async inboxUpsert(workspaceId, summary) {
      await pubsub.publish(
        channels.wsInbox(workspaceId),
        envelope("inbox.upsert", { conversationSummary: summary }),
      );
    },
    async presence(conversationId, visitorOnline) {
      await pubsub.publish(
        channels.convAll(conversationId),
        envelope("presence.update", { conversationId, visitorOnline }),
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
