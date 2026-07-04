/**
 * Hono 앱 제네릭 — c.var 타입.
 * ctx는 AppContext(의존성), 인증 미들웨어가 visitor/user/member를 채운다.
 */
import type { AppContext } from "../context";

/** 검증된 방문자 자격(visitor_token). */
export interface VisitorAuth {
  visitorId: string;
  workspaceId: string;
}

/** 검증된 상담원 세션 자격. */
export interface UserAuth {
  userId: string;
}

/** 특정 워크스페이스 멤버십 자격(membership 미들웨어). */
export interface MemberAuth {
  userId: string;
  workspaceId: string;
  role: string;
}

export interface Variables {
  ctx: AppContext;
  requestId: string;
  visitor?: VisitorAuth;
  user?: UserAuth;
  member?: MemberAuth;
  /** validateJson 미들웨어가 채우는 검증된 본문(핸들러는 validated<T>()로 조회). */
  valid?: unknown;
}

export type HonoEnv = { Variables: Variables };
