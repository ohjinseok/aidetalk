/**
 * 인증 가드 프록시(구 middleware, Next 16에서 proxy로 개명) — 07_DASHBOARD_SPEC §1.
 * od_session 쿠키(04 §0.1)가 없으면 보호 경로 접근 시 /login으로.
 * membership(wsId) 검증은 (app) 레이아웃에서 /v1/me로 수행한다.
 *
 * 주의: 쿠키 존재만 확인(서명 검증 아님). 실제 세션 유효성은 API가 401로 판정 → 클라이언트가 /login 유도.
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "od_session";

/** 인증 없이 접근 가능한 경로. */
const PUBLIC_PREFIXES = ["/login", "/signup", "/invites/accept"];

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 정적/이미지/파비콘 제외한 앱 경로에만 적용.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
