/**
 * Hono 앱 구성. createApp(ctx)가 미들웨어·라우트를 조립한다.
 * 계약은 packages/shared의 zod 스키마가 단일 출처(CLAUDE.md 코딩 컨벤션).
 */
import { Hono } from "hono";

import type { AppContext } from "./context";
import {
  csrfOriginGuard,
  errorHandler,
  injectContext,
  requestIdMiddleware,
} from "./http/middleware";
import type { HonoEnv } from "./http/types";
import { createAuthRoutes, createMeRoute } from "./routes/auth";
import { createInviteRoutes } from "./routes/invites";
import { createTrackingRoutes } from "./routes/tracking";
import { createWebhookRoutes } from "./routes/webhooks";
import { createWidgetRoutes } from "./routes/widget";
import { createWidgetAssetRoutes } from "./routes/widget-assets";
import { createWorkspaceRoutes } from "./routes/workspaces";

/** AppContext를 주입해 전체 앱을 조립한다. */
export function createApp(ctx: AppContext): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.onError(errorHandler);
  app.use("*", requestIdMiddleware);
  app.use("*", injectContext(ctx));

  app.get("/healthz", (c) => c.json({ ok: true, version: ctx.version }));

  // 쿠키 인증(od_session) 경로는 CSRF Origin 화이트리스트 검증(08 §3). 위젯/트래킹은 Bearer/무인증이라 제외.
  app.use("/v1/auth/*", csrfOriginGuard);
  app.use("/v1/invites/*", csrfOriginGuard);
  app.use("/v1/workspaces/*", csrfOriginGuard);

  app.route("/v1/widget", createWidgetRoutes());
  app.route("/v1/auth", createAuthRoutes());
  app.route("/v1", createMeRoute()); // GET /v1/me
  app.route("/v1/invites", createInviteRoutes());
  app.route("/v1/workspaces", createWorkspaceRoutes());
  app.route("/v1/workspaces", createWebhookRoutes());
  app.route("/t", createTrackingRoutes());
  // 위젯 정적 자산(/widget.js, /widget/v{n}/app.js) — 무인증·CSRF 무관(06 §1.1, 10 §3).
  app.route("/", createWidgetAssetRoutes());

  return app;
}
