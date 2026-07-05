/**
 * 방문자 ↔ 대화 소유권 검증 — 08_SECURITY.md §3 불변식(방문자 격리).
 * 위젯 라우트/롱폴 전송/WS 게이트웨이가 공유하는 단일 지점.
 */
import { AppError } from "@aidetalk/shared";

import type { AppContext } from "../context";

/**
 * 방문자가 소유한 대화를 로드한다. 없거나 타 방문자 소유면 not_found로 격리한다
 * (존재 여부를 노출하지 않기 위해 403이 아닌 404).
 */
export async function getVisitorConversationOr404(
  ctx: AppContext,
  visitor: { visitorId: string; workspaceId: string },
  conversationId: string,
) {
  const conv = await ctx.repos.conversation.getById(visitor.workspaceId, conversationId);
  if (!conv || conv.visitorId !== visitor.visitorId) {
    throw AppError.of("not_found", "대화를 찾을 수 없다.");
  }
  return conv;
}
