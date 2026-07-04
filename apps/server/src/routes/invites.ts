/**
 * 초대 수락 — 04_API_SPEC.md §2. POST /v1/invites/accept.
 * 로그인 상태에서 inviteToken으로 멤버십을 활성화한다(membership 미들웨어 밖 — 아직 멤버 아님).
 */
import { AppError } from "@aidetalk/shared";
import { Hono } from "hono";

import { requireUser, validateJson, validated } from "../http/middleware";
import { acceptInviteRequestSchema, type AcceptInviteRequest } from "../http/schemas";
import type { HonoEnv } from "../http/types";

export function createInviteRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.use("/*", requireUser);

  app.post("/accept", validateJson(acceptInviteRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const { userId } = c.get("user")!;
    const body = validated<AcceptInviteRequest>(c);

    const invited = await ctx.repos.member.getByInviteToken(body.inviteToken);
    if (!invited) throw AppError.of("not_found", "유효하지 않은 초대다.");
    // 초대 대상 계정과 로그인 사용자가 일치해야 한다.
    if (invited.userId !== userId) {
      throw AppError.of("auth/forbidden", "이 초대의 대상이 아니다.");
    }

    const member = await ctx.repos.member.acceptInvite(invited.workspaceId, body.inviteToken);
    if (!member) throw AppError.of("not_found", "유효하지 않은 초대다.");
    return c.json({
      member: {
        id: member.id,
        userId: member.userId,
        workspaceId: member.workspaceId,
        role: member.role,
        status: member.status,
      },
    });
  });

  return app;
}
