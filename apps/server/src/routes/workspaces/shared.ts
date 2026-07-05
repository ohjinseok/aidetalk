/**
 * 워크스페이스 라우트 공용 헬퍼 — 대화 로드(격리), owner 권한 확인.
 * 관심사별 라우트 파일(agents/inbox/tracking/members/visitors)이 공유한다.
 */
import { AppError } from "@aidetalk/shared";
import type { Context } from "hono";

import type { HonoEnv, MemberAuth } from "../../http/types";

/** 대화 로드 + 워크스페이스 격리(없으면 404). */
export async function getConvOr404(
  c: Context<HonoEnv>,
  workspaceId: string,
  conversationId: string,
) {
  const ctx = c.get("ctx");
  const conv = await ctx.repos.conversation.getById(workspaceId, conversationId);
  if (!conv) throw AppError.of("not_found", "대화를 찾을 수 없다.");
  return conv;
}

/** owner 권한 강제(아니면 403). */
export function assertOwner(member: MemberAuth): void {
  if (member.role !== "owner") {
    throw AppError.of("auth/forbidden", "소유자만 수행할 수 있다.");
  }
}
