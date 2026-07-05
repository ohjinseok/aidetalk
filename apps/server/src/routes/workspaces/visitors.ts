/**
 * 방문자 API — 04_API_SPEC.md §2. 방문자 PII 파기(owner만).
 * 개인정보보호법 파기 의무 대응(08_SECURITY.md §6 / 03_DATA_MODEL.md §0).
 * "파기"지만 행 삭제가 아니라 **익명화**다(대화 구조·감사 이력 보존, PII 필드/방문자 메시지 본문만 제거).
 * 되돌릴 수 없다. hardDeletePii가 undefined면(방문자 없음/타 워크스페이스) not_found.
 */
import { AppError } from "@aidetalk/shared";
import { Hono } from "hono";

import type { HonoEnv } from "../../http/types";
import { assertOwner } from "./shared";

export function createVisitorRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.delete("/:wsId/visitors/:visitorId/pii", async (c) => {
    const ctx = c.get("ctx");
    const member = c.get("member")!;
    assertOwner(member);
    const wsId = c.req.param("wsId");
    const visitorId = c.req.param("visitorId");

    const result = await ctx.repos.visitor.hardDeletePii(wsId, visitorId);
    if (!result) throw AppError.of("not_found", "방문자를 찾을 수 없다.");

    // 감사 로그 — 파기 이력을 남긴다. visitorId/대화id는 PII 값이 아니므로 기록 가능(규칙 5).
    ctx.logger.info(
      {
        event: "visitor.pii_hard_delete",
        workspaceId: wsId,
        actorUserId: member.userId,
        visitorIds: result.visitorIds,
        redactedConversationIds: result.redactedConversationIds,
      },
      "방문자 PII 파기(익명화) 수행",
    );

    return c.json(result);
  });

  return app;
}
