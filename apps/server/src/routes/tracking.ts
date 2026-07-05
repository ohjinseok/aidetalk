/**
 * 트래킹 엔드포인트(`/t/*`) — 04_API_SPEC.md §3. 무인증, CORS `*`.
 * ⚠️ 손님 페이지에 영향을 주면 안 된다 — 검증 실패/레이트리밋 초과/내부 오류 등
 *   *어떤 실패도* 204로 응답한다(에러 상세는 로그에만 남긴다).
 */
import {
  AppError,
  trackClickRequestSchema,
  trackConversionRequestSchema,
  type TrackConversionRequest,
} from "@aidetalk/shared";
import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { cors } from "hono/cors";

import { getClientIp } from "../http/client-ip";
import { VISITOR_COOKIE } from "../http/middleware";
import type { HonoEnv } from "../http/types";
import { verifyVisitorToken } from "../lib/visitor-token";
import { findAttributionCandidate } from "../services/tracking";

/** 04 §0.2: `/t/*` 60/min/IP(엔드포인트 통합 한도) — 초과해도 응답은 항상 204(무시). */
const TRACKING_RATE_LIMIT = 60;
const TRACKING_RATE_WINDOW_SEC = 60;

export function createTrackingRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  // 손님 사이트(임의 origin)에서 직접 호출 — CORS 전면 허용.
  app.use("*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

  app.post("/click", async (c) => {
    const ctx = c.get("ctx");
    try {
      const ip = getClientIp(c);
      const rl = await ctx.rateLimiter.hit(`t:${ip}`, TRACKING_RATE_LIMIT, TRACKING_RATE_WINDOW_SEC);
      if (rl.allowed) {
        const raw = await c.req.json().catch(() => null);
        const parsed = trackClickRequestSchema.safeParse(raw);
        if (parsed.success) {
          const link = await ctx.repos.trackedLink.findByToken(parsed.data.token);
          if (link) {
            await ctx.repos.trackedLink.markClicked(link.workspaceId, parsed.data.token);
          }
        }
      }
    } catch (err) {
      ctx.logger.debug({ err: (err as Error).message }, "/t/click 처리 실패(무시, 손님 영향 없음)");
    }
    return c.body(null, 204);
  });

  app.post("/conversion", async (c) => {
    const ctx = c.get("ctx");
    try {
      const ip = getClientIp(c);
      const rl = await ctx.rateLimiter.hit(`t:${ip}`, TRACKING_RATE_LIMIT, TRACKING_RATE_WINDOW_SEC);
      if (rl.allowed) {
        const raw = await c.req.json().catch(() => null);
        const parsed = trackConversionRequestSchema.safeParse(raw);
        if (parsed.success) {
          await recordConversion(c, parsed.data);
        }
      }
    } catch (err) {
      ctx.logger.debug({ err: (err as Error).message }, "/t/conversion 처리 실패(무시, 손님 영향 없음)");
    }
    return c.body(null, 204);
  });

  return app;
}

/**
 * 전환 기록 본체. 방문자 식별 실패/귀속 후보 없음/외부 오류 등은 전부 조용히 스킵(no-op)한다
 * — 호출측(/conversion 핸들러)이 최종적으로 204만 반환하면 되기 때문.
 */
async function recordConversion(c: Context<HonoEnv>, body: TrackConversionRequest): Promise<void> {
  const ctx = c.get("ctx");
  const workspace = await ctx.repos.workspace.getById(body.workspaceId);
  if (!workspace) return;

  // 방문자 식별 — body.visitorToken(localStorage) 우선, 없으면 od_visitor 쿠키(04 §3).
  const rawToken = body.visitorToken ?? getCookie(c, VISITOR_COOKIE);
  const payload = rawToken ? verifyVisitorToken(rawToken, ctx.env.VISITOR_TOKEN_SECRET) : null;
  if (!payload || payload.ws !== body.workspaceId) return;

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return;

  const rule = workspace.attributionRule === "first_click" ? "first_click" : "last_click";
  const candidate = await findAttributionCandidate(
    ctx,
    body.workspaceId,
    payload.vis,
    occurredAt,
    rule,
  );
  // TODO(question): 귀속 후보(클릭된 링크)가 없는 경우(예: 픽셀만 있고 링크 클릭이 없는 유입) —
  //   conversions.conversationId가 NOT NULL이라 연결할 대화가 없으면 저장할 수 없다.
  //   pixel(source=pixel) 정확 매출은 04/07 문서 기준 v1.5·v1 미구현 범위라 여기서는 스킵한다.
  if (!candidate) return;

  try {
    await ctx.repos.conversion.create(body.workspaceId, {
      conversationId: candidate.conversationId,
      visitorId: payload.vis,
      trackedLinkId: candidate.trackedLinkId,
      source: "click_only",
      amount: body.amount ?? null,
      currency: body.currency,
      externalRef: body.externalRef ?? null,
      occurredAt,
    });
  } catch (err) {
    // externalRef 중복 → 멱등(conversion/duplicate) — 조용히 무시. 그 외 오류는 상위로 전파(로그 처리).
    if (!(err instanceof AppError && err.code === "conversion/duplicate")) throw err;
  }
}
