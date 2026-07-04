/**
 * 서버 발신 메시지(agent_ai / agent_human / system) 저장 + 브로드캐스트 공통 로직.
 * 손님 메시지(sendVisitorMessage)와 대칭 — 대화 참여자에게 message.new, 인박스에 upsert.
 */
import type { MessageContent, MessageRole, Message, Conversation } from "@aidetalk/shared";

import type { AppContext } from "../context";
import { serializeConversation, serializeMessage } from "../lib/serialize";
import { buildConversationSummary } from "./messaging";

export interface AppendServerMessageInput {
  workspaceId: string;
  conversationId: string;
  role: Exclude<MessageRole, "visitor">;
  authorId: string | null;
  content: MessageContent;
}

/**
 * 서버측 메시지를 저장하고 lastMessageAt 갱신 + message.new + inbox.upsert 브로드캐스트.
 * 반환: 저장된 Message + 갱신된 Conversation(있으면).
 */
export async function appendServerMessage(
  ctx: AppContext,
  input: AppendServerMessageInput,
): Promise<{ message: Message; conversation: Conversation | null }> {
  const row = await ctx.repos.message.append(input.workspaceId, input.conversationId, {
    role: input.role,
    authorId: input.authorId,
    content: input.content,
  });
  const message = serializeMessage(row);

  const updatedConv = await ctx.repos.conversation.touchLastMessage(
    input.workspaceId,
    input.conversationId,
    row.createdAt,
  );

  await ctx.broadcaster.messageNew(input.conversationId, message);

  let conversation: Conversation | null = null;
  if (updatedConv) {
    conversation = serializeConversation(updatedConv);
    const summary = await buildConversationSummary(ctx, input.workspaceId, updatedConv, message);
    if (summary) await ctx.broadcaster.inboxUpsert(input.workspaceId, summary);
  }
  return { message, conversation };
}
