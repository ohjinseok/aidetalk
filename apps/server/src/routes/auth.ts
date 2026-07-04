/**
 * 인증/계정 API — 04_API_SPEC.md §2. argon2id(비번) + Redis/메모리 세션 쿠키(od_session).
 */
import { AppError } from "@aidetalk/shared";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { getClientIp } from "../http/client-ip";
import {
  requireUser,
  SESSION_COOKIE,
  validateJson,
  validated,
} from "../http/middleware";
import {
  loginRequestSchema,
  signupRequestSchema,
  type LoginRequest,
  type SignupRequest,
} from "../http/schemas";
import type { HonoEnv } from "../http/types";
import { SESSION_TTL_SEC } from "../session/store";

/** 로그인 시도 한도 — 04 §0.2 (10/min/IP). */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SEC = 60;

export function createAuthRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.post("/signup", validateJson(signupRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const body = validated<SignupRequest>(c);

    const existing = await ctx.repos.user.getByEmail(body.email);
    if (existing) throw AppError.of("conflict", "이미 가입된 이메일이다.");

    const user = await ctx.repos.user.create(body);
    await startSession(c, user.id);
    return c.json({ user: publicUser(user) }, 201);
  });

  app.post("/login", validateJson(loginRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const ip = getClientIp(c);
    const rl = await ctx.rateLimiter.hit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_SEC);
    if (!rl.allowed) throw AppError.of("rate/limited", "로그인 시도가 너무 잦다.");

    const body = validated<LoginRequest>(c);
    const user = await ctx.repos.user.verifyPassword(body.email, body.password);
    if (!user) throw AppError.of("auth/invalid", "이메일 또는 비밀번호가 올바르지 않다.");

    await startSession(c, user.id);
    return c.json({ user: publicUser(user) });
  });

  app.post("/logout", async (c) => {
    const ctx = c.get("ctx");
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) await ctx.sessionStore.destroy(sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  return app;
}

/** GET /v1/me — 별도 마운트(라우터가 /v1 루트에 붙음). */
export function createMeRoute(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();
  app.get("/me", requireUser, async (c) => {
    const ctx = c.get("ctx");
    const { userId } = c.get("user")!;
    const user = await ctx.repos.user.getById(userId);
    if (!user) throw AppError.of("auth/invalid", "세션이 유효하지 않다.");
    const memberships = await ctx.repos.member.listByUser(userId);
    return c.json({
      user: publicUser(user),
      memberships: memberships.map((m) => ({
        workspaceId: m.workspaceId,
        workspaceName: m.workspaceName,
        role: m.role,
      })),
    });
  });
  return app;
}

/** 세션 생성 + od_session 쿠키 설정(httpOnly+SameSite=Lax, cloud면 Secure). */
async function startSession(c: Context<HonoEnv>, userId: string): Promise<void> {
  const ctx = c.get("ctx");
  const sessionId = await ctx.sessionStore.create(userId);
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: ctx.env.EDITION === "cloud",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

function publicUser(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}
