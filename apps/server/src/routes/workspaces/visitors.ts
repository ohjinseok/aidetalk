/**
 * 방문자 API — 04_API_SPEC.md §2. 방문자 정보 수정/상담 이력 조회(상담원 전용) + PII 파기(owner만).
 * 개인정보보호법 파기 의무 대응(08_SECURITY.md §6 / 03_DATA_MODEL.md §0).
 * "파기"지만 행 삭제가 아니라 **익명화**다(대화 구조·감사 이력 보존, PII 필드/방문자 메시지 본문만 제거).
 * 되돌릴 수 없다. hardDeletePii가 undefined면(방문자 없음/타 워크스페이스) not_found.
 */
import { AppError, agentUpdateVisitorRequestSchema, type AgentUpdateVisitorRequest } from "@aidetalk/shared";
import { Hono } from "hono";

import { validateJson, validated } from "../../http/middleware";
import type { HonoEnv } from "../../http/types";
import { getWsCtx } from "../../http/ws-ctx";
import { publicVisitor, serializeMessage } from "../../lib/serialize";
import { buildConversationSummary } from "../../services/messaging";
import { assertOwner } from "./shared";

/** visitor.updateProfile가 받는 patch 타입(레포 시그니처에서 파생 — email/name/phone는 null 허용). */
type VisitorProfilePatch = Parameters<
  HonoEnv["Variables"]["ctx"]["repos"]["visitor"]["updateProfile"]
>[2];

export function createVisitorRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 방문자 정보 수정(상담원 전용) — name/email/phone 부분 갱신. null은 해당 필드 비우기.
  app.patch(
    "/:wsId/visitors/:visitorId",
    validateJson(agentUpdateVisitorRequestSchema),
    async (c) => {
      const { ctx, wsId } = getWsCtx(c);
      const visitorId = c.req.param("visitorId");
      const body = validated<AgentUpdateVisitorRequest>(c);

      // 전달된 키만 patch에 싣는다(미지정 필드는 건드리지 않음).
      const patch: { name?: string | null; email?: string | null; phone?: string | null } = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.email !== undefined) patch.email = body.email;
      if (body.phone !== undefined) patch.phone = body.phone;

      // ⚠️ 이메일이 바뀌어도 mergeByEmail은 호출하지 않는다 — 방문자 병합은 손님 본인이 위젯에서
      //    이메일을 입력했을 때만 수행한다. 상담원의 프로필 수정은 병합 트리거가 아니다.
      const updated = await ctx.repos.visitor.updateProfile(
        wsId,
        visitorId,
        patch as VisitorProfilePatch,
      );
      // 타 워크스페이스 방문자(또는 없음)는 갱신 대상이 없어 undefined → not_found(격리).
      if (!updated) throw AppError.of("not_found", "visitor not found");

      return c.json({ visitor: publicVisitor(updated) });
    },
  );

  // 이 방문자의 상담 이력(방문자 프로필 패널) — ConversationSummary 목록.
  app.get("/:wsId/visitors/:visitorId/conversations", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const visitorId = c.req.param("visitorId");

    const rows = await ctx.repos.conversation.listByVisitor(wsId, visitorId, 20);
    const items = [];
    for (const conv of rows) {
      const lastRow = await ctx.repos.message.getLast(wsId, conv.id);
      const lastMessage = lastRow ? serializeMessage(lastRow) : null;
      const summary = await buildConversationSummary(ctx, wsId, conv, lastMessage);
      if (summary) items.push(summary);
    }
    return c.json({ items });
  });

  app.delete("/:wsId/visitors/:visitorId/pii", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const member = c.get("member")!;
    assertOwner(member);
    const visitorId = c.req.param("visitorId");

    const result = await ctx.repos.visitor.hardDeletePii(wsId, visitorId);
    if (!result) throw AppError.of("not_found", "visitor not found");

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
