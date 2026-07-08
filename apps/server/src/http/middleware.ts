/**
 * 공통 미들웨어 — request-id 전파, 에러 핸들러, zod 검증, 인증/권한.
 * 04_API_SPEC.md §0(에러 봉투), §0.1(인증 3종), §7(에러 코드).
 */
import { AppError } from "@aidetalk/shared";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { ZodTypeAny } from "zod";

import { genRequestId } from "../logger";
import { verifyVisitorToken } from "../lib/visitor-token";
import type { HonoEnv } from "./types";

export const SESSION_COOKIE = "od_session";

/** 방문자 식별 쿠키(전환 트래킹 폴백, 04 §3). localStorage 토큰이 없을 때만 사용. */
export const VISITOR_COOKIE = "od_visitor";

/** x-request-id를 받거나 생성해 응답 헤더로 되돌리고 c.var에 보관. */
export const requestIdMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId = incoming && incoming.length <= 200 ? incoming : genRequestId();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
};

/** AppContext를 모든 요청 c.var.ctx로 주입하는 미들웨어 생성. */
export function injectContext(ctx: HonoEnv["Variables"]["ctx"]): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    c.set("ctx", ctx);
    await next();
  };
}

/** onError 핸들러 — AppError는 그대로, 그 외는 500 처리(내부 메시지 감춤). */
export function errorHandler(err: Error, c: Context<HonoEnv>): Response {
  const ctx = c.get("ctx");
  const requestId = c.get("requestId");
  if (err instanceof AppError) {
    // 4xx는 정상 흐름(로그 debug), 5xx만 error.
    const log = err.httpStatus >= 500 ? ctx?.logger.error : ctx?.logger.debug;
    log?.call(ctx?.logger, { requestId, code: err.code, status: err.httpStatus }, err.message);
    return c.json(err.toEnvelope(), err.httpStatus as never);
  }
  ctx?.logger.error({ requestId, err: err.message }, "unhandled error");
  // TODO(question): 04 §7 에러 코드 표에 일반 5xx(internal) 코드가 없다.
  //   미처리 예외의 봉투 code를 표에 추가할지(예: "internal") 확정 필요. 우선 정직하게 "internal" 사용.
  return c.json({ error: { code: "internal", message: "internal error" } }, 500 as never);
}

/**
 * zod 검증 미들웨어 — JSON body를 스키마로 파싱해 c.var.valid에 저장.
 * 실패 시 validation/failed(400) + details. 핸들러는 validated<T>(c)로 조회.
 */
export function validateJson(schema: ZodTypeAny): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw AppError.of("validation/failed", "request body validation failed", parsed.error.flatten());
    }
    c.set("valid", parsed.data);
    await next();
  };
}

/** 검증된 body 조회 헬퍼(validateJson 이후). */
export function validated<T>(c: Context<HonoEnv>): T {
  return c.get("valid") as T;
}

/** CSRF 안전 메서드(본문 상태 변경 없음) — Origin 검증 제외. */
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF Origin 화이트리스트 검증 — 08_SECURITY.md §3(쿠키 인증 경로 한정).
 * 상태 변경 메서드(POST/PATCH/PUT/DELETE)에서 `Origin` 헤더가 있으면 허용 목록에 포함돼야 한다.
 * - 허용 목록: DASHBOARD_URL / SERVER_URL의 origin(대시보드는 이 두 곳에서만 호출).
 * - Origin 헤더 부재(서버측·비브라우저 클라이언트)는 통과 — 브라우저는 교차 출처 상태 변경 시 항상 Origin을 실어 보낸다.
 * 쿠키 인증(od_session) 라우터에만 마운트한다. Bearer 인증 위젯/트래킹에는 적용하지 않는다.
 */
export const csrfOriginGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  if (!CSRF_SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin) {
      const ctx = c.get("ctx");
      const allowed = allowedOrigins(ctx.env.DASHBOARD_URL, ctx.env.SERVER_URL);
      if (!allowed.has(origin)) {
        throw AppError.of("auth/forbidden", "origin not allowed");
      }
    }
  }
  await next();
};

/** URL 문자열들에서 origin(scheme+host+port)만 추출한 집합. 파싱 불가한 값은 무시. */
function allowedOrigins(...urls: string[]): Set<string> {
  const set = new Set<string>();
  for (const u of urls) {
    try {
      set.add(new URL(u).origin);
    } catch {
      /* 무시 */
    }
  }
  return set;
}

/**
 * 방문자 인증 — Authorization: Bearer vt.... 검증.
 * 위조/누락 → auth/invalid(401). 08 §3 불변식.
 */
export const requireVisitor: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ctx = c.get("ctx");
  const auth = c.req.header("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
  const payload = token ? verifyVisitorToken(token, ctx.env.VISITOR_TOKEN_SECRET) : null;
  if (!payload) {
    throw AppError.of("auth/invalid", "valid visitor_token required");
  }
  c.set("visitor", { visitorId: payload.vis, workspaceId: payload.ws });
  await next();
};

/**
 * 상담원 세션 인증 — od_session 쿠키 → sessionStore 조회.
 * 무효/누락 → auth/invalid(401).
 */
export const requireUser: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ctx = c.get("ctx");
  const sessionId = getCookie(c, SESSION_COOKIE);
  const userId = sessionId ? await ctx.sessionStore.get(sessionId) : null;
  if (!userId) {
    throw AppError.of("auth/invalid", "authentication required");
  }
  c.set("user", { userId });
  await next();
};

/**
 * 워크스페이스 멤버십 검증 — requireUser 이후에 사용.
 * :wsId 경로 파라미터의 워크스페이스에 대한 멤버가 아니면 auth/forbidden(403).
 */
export const requireMembership: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ctx = c.get("ctx");
  const user = c.get("user");
  if (!user) throw AppError.of("auth/invalid", "authentication required");
  const workspaceId = c.req.param("wsId");
  if (!workspaceId) throw AppError.of("not_found", "workspace not found");
  const role = await ctx.repos.member.getRole(workspaceId, user.userId);
  if (!role) {
    throw AppError.of("auth/forbidden", "workspace access forbidden");
  }
  c.set("member", { userId: user.userId, workspaceId, role });
  await next();
};
