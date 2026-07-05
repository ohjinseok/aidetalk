/**
 * 핸드오프 3경로 공통 로직 — 02_ARCHITECTURE.md §3.1/§3.2.
 *  ① 에이전트 handoff 응답  ② 손님 요청(POST /v1/widget/handoff)  ③ dispatch 실패 자동
 * 공통: mode=human 전환 + conversation_events 기록 + (있으면) 손님 안내 메시지 +
 *       agents 채널로 handoff.new push + conversation.updated 브로드캐스트.
 */
import type { Conversation, EventType } from "@aidetalk/shared";

import type { AppContext } from "../context";
import { serializeConversation } from "../lib/serialize";
import { buildConversationSummary } from "./messaging";
import { appendServerMessage } from "./outbound";

export interface PerformHandoffInput {
  workspaceId: string;
  /** 현재(전환 전) 대화. */
  conversation: Conversation;
  eventType: Extract<EventType, "handoff_agent" | "handoff_requested" | "handoff_auto">;
  /** 상담원에게 표시할 사유(handoff.new). */
  reason: string;
  /** 상담원용 요약(선택). */
  summary?: string | null;
  /** 손님에게 보낼 안내 메시지(없으면 미발송). role=system으로 저장. */
  messageToVisitor?: string | null;
  /** 이벤트 actor — 'agent:{id}' | 'visitor:{id}' | 'system'. */
  actor: string;
}

/** 대화를 사람에게 넘긴다. 이미 human이면 mode 전환은 멱등. 반환: 갱신된 Conversation. */
export async function performHandoff(
  ctx: AppContext,
  input: PerformHandoffInput,
): Promise<Conversation> {
  // 1) mode=human 전환.
  const updatedRow = await ctx.repos.conversation.setMode(
    input.workspaceId,
    input.conversation.id,
    "human",
  );
  const conversation = updatedRow
    ? serializeConversation(updatedRow)
    : { ...input.conversation, mode: "human" as const };

  // 2) 감사 이벤트 기록.
  await ctx.repos.event.append(input.workspaceId, input.conversation.id, {
    type: input.eventType,
    actor: input.actor,
    payload: {
      reason: input.reason,
      ...(input.summary ? { summary: input.summary } : {}),
    },
  });

  // 3) 손님 안내 메시지(있을 때).
  if (input.messageToVisitor) {
    await appendServerMessage(ctx, {
      workspaceId: input.workspaceId,
      conversationId: input.conversation.id,
      role: "system",
      authorId: null,
      content: { type: "text", text: input.messageToVisitor },
    });
  }

  // 4) conversation.updated 브로드캐스트(mode 변경).
  await ctx.broadcaster.conversationUpdated(conversation);

  // 5) handoff.new push(agent 인박스 알림) — 손님 안내 메시지가 없으면 마지막 메시지로 요약 생성.
  const lastRow = await ctx.repos.message.getLast(input.workspaceId, input.conversation.id);
  const lastMessage = lastRow
    ? {
        id: lastRow.id,
        conversationId: lastRow.conversationId,
        role: lastRow.role as never,
        authorId: lastRow.authorId,
        content: lastRow.content,
        createdAt:
          lastRow.createdAt instanceof Date
            ? lastRow.createdAt.toISOString()
            : String(lastRow.createdAt),
      }
    : null;
  const convSummary = await buildConversationSummary(
    ctx,
    input.workspaceId,
    updatedRow ?? { ...input.conversation, mode: "human" },
    lastMessage,
  );
  if (convSummary) {
    await ctx.broadcaster.handoffNew(
      input.workspaceId,
      convSummary,
      input.reason,
      input.summary ?? null,
    );
    // 인박스 목록 상태 갱신도 함께.
    await ctx.broadcaster.inboxUpsert(input.workspaceId, convSummary);
  }

  // 6) 웹훅(구독한 워크스페이스에만) — fire-and-forget, 응답을 기다리지 않는다(08 §7).
  ctx.webhookDispatcher.dispatch(input.workspaceId, "conversation.handoff", {
    conversationId: input.conversation.id,
    reason: input.reason,
  });

  return conversation;
}
