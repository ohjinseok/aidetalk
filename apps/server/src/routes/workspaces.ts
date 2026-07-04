/**
 * 워크스페이스 API — 04_API_SPEC.md §2. 세션 쿠키 인증 + membership 검증.
 * 이번 웨이브는 생성/조회만. 멤버 초대·agents CRUD·설정 변경은 다음 웨이브(라우터는 확장 가능한 구조).
 */
import { AppError } from "@aidetalk/shared";
import { Hono } from "hono";

import {
  requireMembership,
  requireUser,
  validateJson,
  validated,
} from "../http/middleware";
import { createWorkspaceRequestSchema, type CreateWorkspaceRequest } from "../http/schemas";
import type { HonoEnv } from "../http/types";

export function createWorkspaceRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 전 경로 로그인 필수.
  app.use("/*", requireUser);

  // ---------- 워크스페이스 생성(생성자=owner) ----------
  app.post("/", validateJson(createWorkspaceRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const { userId } = c.get("user")!;
    const body = validated<CreateWorkspaceRequest>(c);

    const workspace = await ctx.repos.workspace.create({
      name: body.name,
      segment: body.segment,
    });
    await ctx.repos.member.addActive(workspace.id, userId, "owner");

    return c.json({ workspace: serializeWorkspace(workspace) }, 201);
  });

  // ---------- 단건 조회(membership 필요) ----------
  app.get("/:wsId", requireMembership, async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const workspace = await ctx.repos.workspace.getById(wsId);
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");
    return c.json({ workspace: serializeWorkspace(workspace) });
  });

  // TODO(next-wave): POST /:wsId/members, agents CRUD, PATCH /:wsId/settings, 인박스 라우트.

  return app;
}

function serializeWorkspace(row: {
  id: string;
  name: string;
  segment: string;
  plan: string;
  widgetSettings: Record<string, unknown>;
  attributionRule: string;
  createdAt: Date | string;
}) {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    plan: row.plan,
    widgetSettings: row.widgetSettings,
    attributionRule: row.attributionRule,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}
