/**
 * 멤버 API — 04_API_SPEC.md §2. 초대(owner만)/목록/삭제.
 * 초대는 두 경로를 모두 지원한다:
 *  - 기가입 이메일 → members 초대(수락 후 합류).
 *  - 미가입 이메일 → invites 행 생성(가입/로그인 후 수락).
 * 두 경우 모두 inviteUrl은 대시보드 /invites/accept?token= 로 통일한다.
 */
import { randomBytes } from "node:crypto";

import { hashSecret } from "@aidetalk/db";
import { AppError, inviteMemberRequestSchema, type InviteMemberRequest } from "@aidetalk/shared";
import { Hono } from "hono";

import { validateJson, validated } from "../../http/middleware";
import type { HonoEnv } from "../../http/types";
import { getWsCtx } from "../../http/ws-ctx";
import { serializeInvite, serializeMember } from "../../lib/serialize";
import { assertOwner } from "./shared";

export function createMemberRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 초대(owner만) — planEnforcer.assertCanAddSeat.
  app.post("/:wsId/members", validateJson(inviteMemberRequestSchema), async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const owner = c.get("member")!;
    assertOwner(owner);
    const body = validated<InviteMemberRequest>(c);

    // 시트 한도 검사는 초대(행 생성) 시점에.
    await ctx.planEnforcer.assertCanAddSeat(wsId);

    const acceptUrl = (token: string) =>
      `${ctx.env.DASHBOARD_URL}/invites/accept?token=${encodeURIComponent(token)}`;

    const user = await ctx.repos.user.getByEmail(body.email);
    if (user) {
      // 기가입 계정 — members 초대(수락 후 합류).
      if (await ctx.repos.member.getRole(wsId, user.id)) {
        throw AppError.of("conflict", "already a workspace member");
      }
      const member = await ctx.repos.member.invite(wsId, { userId: user.id, role: body.role });
      return c.json(
        { member: serializeMember(member), inviteUrl: acceptUrl(member.inviteToken!) },
        201,
      );
    }

    // 미가입 이메일 — invites 행 생성. raw token은 응답 URL에만 노출, DB엔 sha256만 저장.
    const rawToken = randomBytes(24).toString("base64url");
    const invite = await ctx.repos.invite.create(wsId, {
      email: body.email,
      role: body.role,
      tokenHash: hashSecret(rawToken),
      invitedBy: owner.userId,
    });
    return c.json({ member: null, invite: serializeInvite(invite), inviteUrl: acceptUrl(rawToken) }, 201);
  });

  // 목록.
  app.get("/:wsId/members", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    const rows = await ctx.repos.member.list(wsId);
    // repo 조인 프로젝션에는 workspaceId가 없다 — 계약(memberSchema)이 요구하므로 경로 값으로 채운다.
    return c.json({
      items: rows.map((r) => serializeMember({ ...r, workspaceId: wsId })),
      nextCursor: null,
    });
  });

  // 삭제(owner만).
  app.delete("/:wsId/members/:id", async (c) => {
    const { ctx, wsId } = getWsCtx(c);
    assertOwner(c.get("member")!);
    await ctx.repos.member.remove(wsId, c.req.param("id"));
    return c.body(null, 204);
  });

  return app;
}
