/**
 * Agent Dispatcher 인터페이스 — 02_ARCHITECTURE.md §3.1.
 * 이번 웨이브는 자리(hook)만: mode=ai 대화에 손님 메시지가 저장된 뒤 호출된다.
 * 실제 HTTP 릴레이/HMAC/타임아웃/track_links 치환은 다음 웨이브(M1 W5).
 *
 * ⚠️ CLAUDE.md 규칙 1: 코어는 LLM을 호출하지 않는다. 여기서는 유저 endpoint로 릴레이만 한다.
 */
import type { Conversation, Message } from "@aidetalk/shared";

export interface VisitorMessageContext {
  workspaceId: string;
  conversation: Conversation;
  message: Message;
}

export interface AgentDispatcher {
  /**
   * mode=ai 대화에 손님 메시지가 저장·브로드캐스트된 직후 호출.
   * 구현체는 active agent로 dispatch하여 reply/handoff/noop을 처리한다(다음 웨이브).
   */
  onVisitorMessage(ctx: VisitorMessageContext): Promise<void>;
}

/** 셀프호스팅/테스트 기본 구현 — 아무 동작도 하지 않는다. */
export class NoopAgentDispatcher implements AgentDispatcher {
  async onVisitorMessage(_ctx: VisitorMessageContext): Promise<void> {
    // 다음 웨이브에서 실제 dispatch 구현으로 교체.
  }
}
