/**
 * 메시징 서비스 — WS message.send와 long-poll 폴백 POST가 공유하는 핵심 로직.
 * 02_ARCHITECTURE.md §3.1: 저장(중복 제거) → ack → message.new 브로드캐스트 → (mode=ai면) dispatch.
 * 순서/중복/재전송 신뢰성(09 §2)의 단일 구현 지점.
 */
import type { AppContext } from "../context";
import type { ConversationSummary, Message } from "@aidetalk/shared";
import { AppError } from "@aidetalk/shared";

import { messagePreview, serializeConversation, serializeMessage } from "../lib/serialize";
import type { VisitorAuth } from "../http/types";

/** 방문자 메시지 전송 한도 — 04 §0.2 (10 msg/min/visitor). */
export const VISITOR_MSG_LIMIT = 10;
export const VISITOR_MSG_WINDOW_SEC = 60;

export interface SendVisitorMessageInput {
  visitor: VisitorAuth;
  conversationId: string;
  clientMsgId: string;
  text: string;
}

/**
 * 방문자 메시지 저장 + 브로드캐스트 + (mode=ai) dispatch 훅.
 * 중복 clientMsgId는 기존 메시지를 그대로 반환(멱등) — 재전송/중복 제거 보장.
 * 대화가 방문자 소유가 아니면 not_found(격리).
 */
export async function sendVisitorMessage(
  ctx: AppContext,
  input: SendVisitorMessageInput,
): Promise<Message> {
  const { visitor, conversationId, clientMsgId, text } = input;
  const conv = await ctx.repos.conversation.getById(visitor.workspaceId, conversationId);
  if (!conv || conv.visitorId !== visitor.visitorId) {
    throw AppError.of("not_found", "대화를 찾을 수 없다.");
  }

  const row = await ctx.repos.message.append(visitor.workspaceId, conversationId, {
    role: "visitor",
    authorId: visitor.visitorId,
    content: { type: "text", text },
    clientMsgId,
  });
  const message = serializeMessage(row);

  // lastMessageAt 갱신(인박스 정렬 기준)은 방금 저장한 메시지 시각으로.
  const updatedConv = await ctx.repos.conversation.touchLastMessage(
    visitor.workspaceId,
    conversationId,
    row.createdAt,
  );

  // conv 참여자 전체에 message.new(발신 visitor 소켓은 게이트웨이 필터에서 자기 메시지 제외).
  await ctx.broadcaster.messageNew(conversationId, message);

  // 인박스 목록 실시간 갱신.
  const summary = await buildConversationSummary(
    ctx,
    visitor.workspaceId,
    updatedConv ?? conv,
    message,
  );
  if (summary) await ctx.broadcaster.inboxUpsert(visitor.workspaceId, summary);

  // mode=ai면 dispatcher 훅(실구현은 다음 웨이브의 Noop).
  if ((updatedConv ?? conv).mode === "ai") {
    await ctx.dispatcher.onVisitorMessage({
      workspaceId: visitor.workspaceId,
      conversation: serializeConversation(updatedConv ?? conv),
      message,
    });
  }

  return message;
}

/** 인박스 요약(ConversationSummary) 조립 — visitor 프로필 + 마지막 메시지 미리보기. */
export async function buildConversationSummary(
  ctx: AppContext,
  workspaceId: string,
  conversationRow: Parameters<typeof serializeConversation>[0],
  lastMessage: Message | null,
): Promise<ConversationSummary | null> {
  const visitor = await ctx.repos.visitor.getById(workspaceId, conversationRow.visitorId);
  if (!visitor) return null;
  return {
    conversation: serializeConversation(conversationRow),
    visitor: { id: visitor.id, name: visitor.name, email: visitor.email },
    lastMessage: lastMessage
      ? {
          textPreview: messagePreview(lastMessage.content),
          role: lastMessage.role,
          createdAt: lastMessage.createdAt,
        }
      : null,
  };
}
