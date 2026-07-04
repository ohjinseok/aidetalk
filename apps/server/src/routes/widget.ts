/**
 * 위젯 API — 04_API_SPEC.md §1 (`/v1/widget/*`). visitor_token 인증(세션 발급은 무인증).
 */
import { AppError } from "@aidetalk/shared";
import { t } from "@aidetalk/i18n";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { getClientIp } from "../http/client-ip";
import {
  requireVisitor,
  validateJson,
  validated,
} from "../http/middleware";
import {
  createConversationRequestSchema,
  longPollSendRequestSchema,
  profilePatchRequestSchema,
  sessionRequestSchema,
  widgetHandoffRequestSchema,
  type CreateConversationRequest,
  type LongPollSendRequest,
  type ProfilePatchRequest,
  type SessionRequest,
  type WidgetHandoffRequest,
} from "../http/schemas";
import type { HonoEnv } from "../http/types";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { serializeConversation, serializeMessage } from "../lib/serialize";
import { performHandoff } from "../services/handoff";
import { signVisitorToken, verifyVisitorToken } from "../lib/visitor-token";
import {
  evaluateWidgetSettings,
  extractGreeting,
  extractOffHoursMessage,
  isOfficeHours,
} from "../lib/widget-settings";
import {
  sendVisitorMessage,
  VISITOR_MSG_LIMIT,
  VISITOR_MSG_WINDOW_SEC,
} from "../services/messaging";

/** POST /v1/widget/session 한도 — 04 §0.2 (30/min/IP). */
const SESSION_LIMIT = 30;
const SESSION_WINDOW_SEC = 60;

export function createWidgetRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 위젯은 손님 사이트(임의 origin)에 임베드되어 크로스오리진으로 호출한다 — CORS 전면 허용.
  // 인증은 Authorization Bearer(visitor_token)라 쿠키 credentials가 필요 없다(origin "*" 안전).
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowHeaders: ["authorization", "content-type"],
    }),
  );

  // ---------- 세션 발급/복원 (인증 불필요) ----------
  app.post("/session", validateJson(sessionRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const ip = getClientIp(c);
    const rl = await ctx.rateLimiter.hit(`session:${ip}`, SESSION_LIMIT, SESSION_WINDOW_SEC);
    if (!rl.allowed) throw AppError.of("rate/limited", "요청이 너무 많다. 잠시 후 다시 시도하라.");

    const body = validated<SessionRequest>(c);
    const workspace = await ctx.repos.workspace.getById(body.workspaceId);
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");

    // 기존 토큰이 유효하고 같은 워크스페이스면 동일 visitor 복원.
    let existingVisitorId: string | undefined;
    if (body.existingToken) {
      const payload = verifyVisitorToken(body.existingToken, ctx.env.VISITOR_TOKEN_SECRET);
      if (payload && payload.ws === body.workspaceId) existingVisitorId = payload.vis;
    }

    const visitor = await ctx.repos.visitor.getOrCreateByToken(body.workspaceId, {
      visitorId: existingVisitorId,
      firstReferrer: body.referrer,
      firstPageUrl: body.pageUrl,
    });
    await ctx.repos.visitor.touchLastSeen(body.workspaceId, visitor.id);

    const visitorToken = signVisitorToken(
      { vis: visitor.id, ws: body.workspaceId, iat: Math.floor(Date.now() / 1000) },
      ctx.env.VISITOR_TOKEN_SECRET,
    );

    const openConv = await ctx.repos.conversation.getLatestOpenByVisitor(
      body.workspaceId,
      visitor.id,
    );

    return c.json({
      visitorToken,
      visitor: { id: visitor.id, email: visitor.email, name: visitor.name },
      workspaceName: workspace.name, // 위젯 헤더 표기용(04 §1)
      widgetSettings: evaluateWidgetSettings(workspace.widgetSettings),
      openConversationId: openConv?.id ?? null,
    });
  });

  // 이하 전 경로 visitor_token 필수.
  app.use("/*", requireVisitor);

  // ---------- 대화 시작 ----------
  app.post("/conversations", validateJson(createConversationRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const visitor = c.get("visitor")!;
    const body = validated<CreateConversationRequest>(c);

    // planEnforcer 훅 — Noop은 통과, cloud는 초과 시 402 plan/limit_exceeded.
    await ctx.planEnforcer.assertCanCreateConversation(visitor.workspaceId);

    const workspace = await ctx.repos.workspace.getById(visitor.workspaceId);
    if (!workspace) throw AppError.of("not_found", "워크스페이스를 찾을 수 없다.");

    // active agent 있으면 ai, 없으면 human으로 시작.
    const activeAgent = await ctx.repos.agent.getActive(visitor.workspaceId);
    const mode = activeAgent ? "ai" : "human";

    const conv = await ctx.repos.conversation.create(visitor.workspaceId, {
      visitorId: visitor.visitorId,
      mode,
      status: "open",
      metadata: body.pageUrl ? { startPageUrl: body.pageUrl } : {},
    });

    // greeting을 role=system으로 자동 삽입(있을 때).
    const greeting = extractGreeting(workspace.widgetSettings);
    if (greeting) {
      await ctx.repos.message.append(visitor.workspaceId, conv.id, {
        role: "system",
        authorId: null,
        content: { type: "text", text: greeting },
      });
    }
    // 운영시간 외이면 offHoursMessage(없으면 i18n 기본)도 삽입.
    if (!isOfficeHours(workspace.widgetSettings)) {
      const offHours =
        extractOffHoursMessage(workspace.widgetSettings) ?? t("widget.offHoursDefault");
      await ctx.repos.message.append(visitor.workspaceId, conv.id, {
        role: "system",
        authorId: null,
        content: { type: "text", text: offHours },
      });
    }

    return c.json({ conversation: serializeConversation(conv) }, 201);
  });

  // ---------- 메시지 목록(재연결 동기화) ----------
  app.get("/conversations/:id/messages", async (c) => {
    const ctx = c.get("ctx");
    const visitor = c.get("visitor")!;
    const conversationId = c.req.param("id");
    await assertVisitorOwnsConversation(ctx, visitor, conversationId);

    const after = decodeCursor(c.req.query("after"));
    const limit = clampLimit(c.req.query("limit"), 50, 100);
    const rows = await ctx.repos.message.listAfter(
      visitor.workspaceId,
      conversationId,
      after,
      limit,
    );
    const items = rows.map(serializeMessage);
    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? encodeCursor(last) : null;
    return c.json({ items, nextCursor });
  });

  // ---------- long-poll 폴백 전송 (WS message.send와 동일 처리) ----------
  app.post("/conversations/:id/messages", validateJson(longPollSendRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const visitor = c.get("visitor")!;
    const conversationId = c.req.param("id");

    const rl = await ctx.rateLimiter.hit(
      `msg:${visitor.visitorId}`,
      VISITOR_MSG_LIMIT,
      VISITOR_MSG_WINDOW_SEC,
    );
    if (!rl.allowed) throw AppError.of("rate/limited", "메시지 전송이 너무 잦다.");

    const body = validated<LongPollSendRequest>(c);
    const message = await sendVisitorMessage(ctx, {
      visitor,
      conversationId,
      clientMsgId: body.clientMsgId,
      text: body.text,
    });
    return c.json({ message }, 201);
  });

  // ---------- 손님 "상담원 연결" 요청 ----------
  app.post("/handoff", validateJson(widgetHandoffRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const visitor = c.get("visitor")!;
    const body = validated<WidgetHandoffRequest>(c);

    const conv = await ctx.repos.conversation.getById(visitor.workspaceId, body.conversationId);
    if (!conv || conv.visitorId !== visitor.visitorId) {
      throw AppError.of("not_found", "대화를 찾을 수 없다.");
    }

    // 이미 human이면 멱등(중복 이벤트 방지).
    if (conv.mode !== "human") {
      await performHandoff(ctx, {
        workspaceId: visitor.workspaceId,
        conversation: serializeConversation(conv),
        eventType: "handoff_requested",
        reason: t("server.handoffRequestedReason"),
        summary: null,
        messageToVisitor: null,
        actor: `visitor:${visitor.visitorId}`,
      });
    }
    return c.json({ ok: true });
  });

  // ---------- 프로필 점진 수집 ----------
  app.patch("/profile", validateJson(profilePatchRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const visitor = c.get("visitor")!;
    const body = validated<ProfilePatchRequest>(c);

    await ctx.repos.visitor.updateProfile(visitor.workspaceId, visitor.visitorId, {
      email: body.email,
      name: body.name,
    });

    // email 제공 시 동일 email visitor와 병합 → canonical로 새 토큰 발급.
    let effectiveVisitorId = visitor.visitorId;
    if (body.email) {
      const merged = await ctx.repos.visitor.mergeByEmail(
        visitor.workspaceId,
        body.email,
        visitor.visitorId,
      );
      if (merged?.mergedInto) effectiveVisitorId = merged.mergedInto;
    }

    const effective = await ctx.repos.visitor.getById(visitor.workspaceId, effectiveVisitorId);
    const visitorToken = signVisitorToken(
      { vis: effectiveVisitorId, ws: visitor.workspaceId, iat: Math.floor(Date.now() / 1000) },
      ctx.env.VISITOR_TOKEN_SECRET,
    );
    return c.json({
      visitorToken,
      visitor: effective
        ? { id: effective.id, email: effective.email, name: effective.name }
        : { id: effectiveVisitorId, email: body.email ?? null, name: body.name ?? null },
    });
  });

  return app;
}

/** 대화가 방문자 소유인지 검증. 아니면 not_found로 격리. */
async function assertVisitorOwnsConversation(
  ctx: HonoEnv["Variables"]["ctx"],
  visitor: NonNullable<HonoEnv["Variables"]["visitor"]>,
  conversationId: string,
): Promise<void> {
  const conv = await ctx.repos.conversation.getById(visitor.workspaceId, conversationId);
  if (!conv || conv.visitorId !== visitor.visitorId) {
    throw AppError.of("not_found", "대화를 찾을 수 없다.");
  }
}

function clampLimit(raw: string | undefined, fallback: number, max: number): number {
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
