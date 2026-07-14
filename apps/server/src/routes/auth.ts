/**
 * 인증/계정 API — 04_API_SPEC.md §2. argon2id(비번) + Redis/메모리 세션 쿠키(od_session).
 */
import {
  AppError,
  loginRequestSchema,
  signupRequestSchema,
  type LoginRequest,
  type SignupRequest,
} from "@aidetalk/shared";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { getClientIp } from "../http/client-ip";
import {
  requireUser,
  SESSION_COOKIE,
  validateJson,
  validated,
} from "../http/middleware";
import type { HonoEnv } from "../http/types";
import { shouldUseSecureCookie } from "../lib/secure-cookie";
import { publicUser } from "../lib/serialize";
import { SESSION_TTL_SEC } from "../session/store";

/** 로그인 시도 한도 — 04 §0.2 (10/min/IP). */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SEC = 60;

/**
 * 가입 시도 한도 — 5/시간/IP (08 §3).
 * 로그인(10/min)보다 훨씬 보수적인 이유:
 * - 정상 사용자는 가입을 사실상 1회만 한다(초대 수락 포함해도 시간당 5회면 넉넉).
 * - 가입 1회마다 argon2id(19MiB)가 돌아 대량 병렬 가입은 메모리 고갈 DoS가 된다.
 * - 공개 인스턴스에서 스크립트로 계정을 무한 생성하는 남용을 막는다.
 */
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_SEC = 3600;

export function createAuthRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.post("/signup", validateJson(signupRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const ip = getClientIp(c);
    const rl = await ctx.rateLimiter.hit(`signup:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_SEC);
    if (!rl.allowed) throw AppError.of("rate/limited", "too many signup attempts");

    const body = validated<SignupRequest>(c);

    if (!(await isSignupAllowed(c, body.email))) {
      throw AppError.of("auth/forbidden", "public signup is disabled on this instance");
    }

    const existing = await ctx.repos.user.getByEmail(body.email);
    if (existing) throw AppError.of("conflict", "email already registered");

    const user = await ctx.repos.user.create(body);
    await startSession(c, user.id);
    return c.json({ user: publicUser(user) }, 201);
  });

  app.post("/login", validateJson(loginRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const ip = getClientIp(c);
    const rl = await ctx.rateLimiter.hit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_SEC);
    if (!rl.allowed) throw AppError.of("rate/limited", "too many login attempts");

    const body = validated<LoginRequest>(c);
    const user = await ctx.repos.user.verifyPassword(body.email, body.password);
    if (!user) throw AppError.of("auth/invalid", "invalid email or password");

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
    if (!user) throw AppError.of("auth/invalid", "invalid session");
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

/**
 * 가입 허용 여부 — 08 §3.
 * 1) ALLOW_PUBLIC_SIGNUP=true면 항상 허용(공개 가입 인스턴스).
 * 2) 유저가 0명인 신규 인스턴스는 항상 허용 — 아무도 첫 관리자 계정을 못 만드는 잠김 방지.
 * 3) 유효한 초대를 받은 이메일은 항상 허용 — 초대 기반 운영이 기본 흐름이므로 막으면 안 된다.
 * 그 외(=이미 유저가 있는 인스턴스에서 초대 없는 가입)는 차단 → 403 auth/forbidden.
 */
async function isSignupAllowed(c: Context<HonoEnv>, email: string): Promise<boolean> {
  const ctx = c.get("ctx");
  if (ctx.env.ALLOW_PUBLIC_SIGNUP) return true;
  const userCount = await ctx.repos.user.countAll();
  if (userCount === 0) return true;
  return await ctx.repos.invite.hasPendingByEmail(email);
}

/** 세션 생성 + od_session 쿠키 설정(httpOnly+SameSite=Lax, 공개 오리진이 https면 Secure). */
async function startSession(c: Context<HonoEnv>, userId: string): Promise<void> {
  const ctx = c.get("ctx");
  const sessionId = await ctx.sessionStore.create(userId);
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: shouldUseSecureCookie(ctx.env),
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}
