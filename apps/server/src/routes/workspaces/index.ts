/**
 * 워크스페이스 API — 04_API_SPEC.md §2. 세션 쿠키 인증 + membership 검증.
 * 워크스페이스 코어(생성/조회/설정)를 직접 정의하고, 나머지 관심사(Agent 커넥터/인박스/
 * 트래킹/멤버/방문자)는 관심사별 서브라우터로 마운트한다. 라우트 경로는 전부 이 접두사 아래.
 * DB 접근은 전부 repos 경유(라우트 직접 쿼리 금지). 에러 코드는 04 §7만.
 */
import { AppError } from "@aidetalk/shared";
import { Hono } from "hono";

import { requireMembership, requireUser, validateJson, validated } from "../../http/middleware";
import {
  createWorkspaceRequestSchema,
  updateWorkspaceSettingsRequestSchema,
  type CreateWorkspaceRequest,
  type UpdateWorkspaceSettingsRequest,
} from "../../http/schemas";
import type { HonoEnv } from "../../http/types";
import { serializeWorkspace } from "../../lib/serialize";
import { createAgentRoutes } from "./agents";
import { createInboxRoutes } from "./inbox";
import { createMemberRoutes } from "./members";
import { assertOwner } from "./shared";
import { createWorkspaceTrackingRoutes } from "./tracking";
import { createVisitorRoutes } from "./visitors";

export function createWorkspaceRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 전 경로 로그인 필수.
  app.use("/*", requireUser);
  // 워크스페이스 하위 리소스는 전부 membership 검증(§2).
  app.use("/:wsId/*", requireMembership);

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

  // ---------- 단건 조회 ----------
  app.get("/:wsId", requireMembership, async (c) => {
    const ctx = c.get("ctx");
    const workspace = await ctx.repos.workspace.getById(c.req.param("wsId"));
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");
    return c.json({ workspace: serializeWorkspace(workspace) });
  });

  // ---------- 워크스페이스 설정(owner만) ----------
  app.patch("/:wsId/settings", validateJson(updateWorkspaceSettingsRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    assertOwner(c.get("member")!);
    const wsId = c.req.param("wsId");
    const body = validated<UpdateWorkspaceSettingsRequest>(c);

    const workspace = await ctx.repos.workspace.getById(wsId);
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");

    const updated = await ctx.repos.workspace.updateSettingsFields(wsId, {
      name: body.name,
      widgetSettings: body.widgetSettings,
      attributionRule: body.attributionRule,
    });
    return c.json({ workspace: serializeWorkspace(updated ?? workspace) });
  });

  // ---------- 관심사별 서브라우터(미들웨어·경로 접두사는 상위에서 공유) ----------
  app.route("/", createAgentRoutes());
  app.route("/", createInboxRoutes());
  app.route("/", createWorkspaceTrackingRoutes());
  app.route("/", createMemberRoutes());
  app.route("/", createVisitorRoutes());

  return app;
}
