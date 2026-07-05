/**
 * 초대 수락 — 04_API_SPEC.md §2. POST /v1/invites/accept.
 * 로그인 상태에서 inviteToken으로 멤버십을 활성화한다(membership 미들웨어 밖 — 아직 멤버 아님).
 *
 * 두 종류의 토큰을 모두 수락한다:
 *  1) invites 행(미가입 이메일 초대) — token_hash 조회. 만료/중복 수락 거부 + 대상 이메일 일치 검증.
 *  2) members 행(기가입 계정 초대) — inviteToken(raw) 조회. 기존 흐름 유지.
 */
import { hashSecret } from "@aidetalk/db";
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

    // (1) 미가입 이메일 초대(invites 테이블) — token_hash 조회.
    const invite = await ctx.repos.invite.getByTokenHash(hashSecret(body.inviteToken));
    if (invite) {
      if (invite.acceptedAt) throw AppError.of("conflict", "이미 수락된 초대다.");
      if (invite.expiresAt.getTime() < Date.now()) {
        throw AppError.of("not_found", "만료되었거나 유효하지 않은 초대다.");
      }
      const user = await ctx.repos.user.getById(userId);
      if (!user || user.email !== invite.email) {
        throw AppError.of("auth/forbidden", "이 초대의 대상 이메일이 아니다.");
      }
      if (await ctx.repos.member.getRole(invite.workspaceId, userId)) {
        throw AppError.of("conflict", "이미 워크스페이스 멤버다.");
      }
      // 원자적 수락 마킹(동시/재수락 거부).
      const marked = await ctx.repos.invite.markAccepted(invite.workspaceId, invite.id);
      if (!marked) throw AppError.of("conflict", "이미 수락된 초대다.");

      const member = await ctx.repos.member.addActive(
        invite.workspaceId,
        userId,
        invite.role as "owner" | "agent_member",
      );
      return c.json({
        member: {
          id: member.id,
          userId: member.userId,
          workspaceId: member.workspaceId,
          role: member.role,
          status: member.status,
        },
      });
    }

    // (2) 기가입 계정 초대(members 테이블) — inviteToken(raw) 조회.
    const invited = await ctx.repos.member.getByInviteToken(body.inviteToken);
    if (!invited) throw AppError.of("not_found", "유효하지 않은 초대다.");
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
