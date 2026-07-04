/**
 * visitor_token 서명/검증 — 04_API_SPEC.md §0.1.
 * 형식: `vt.{base64url(json{vis, ws, iat})}.{hmac_sha256(payload, VISITOR_TOKEN_SECRET)}`.
 * 서버는 서명만 검증(무상태). 만료 없음(v1). 위조(서명 불일치) → 401은 호출측이 처리.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** 토큰 payload — 방문자 id, 워크스페이스 id, 발급 시각(초). */
export interface VisitorTokenPayload {
  vis: string;
  ws: string;
  iat: number;
}

/** payload를 서명해 `vt.{payload}.{sig}` 토큰 생성. */
export function signVisitorToken(payload: VisitorTokenPayload, secret: string): string {
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = hmac(body, secret);
  return `vt.${body}.${sig}`;
}

/**
 * 토큰 검증. 형식/서명이 유효하면 payload, 아니면 null.
 * 서명 비교는 상수시간(timingSafeEqual).
 */
export function verifyVisitorToken(token: string, secret: string): VisitorTokenPayload | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "vt") return null;
  const [, body, sig] = parts;
  if (!body || !sig) return null;

  const expected = hmac(body, secret);
  if (!constantTimeEquals(sig, expected)) return null;

  try {
    const json = JSON.parse(base64urlDecode(body)) as unknown;
    if (
      typeof json === "object" &&
      json !== null &&
      typeof (json as VisitorTokenPayload).vis === "string" &&
      typeof (json as VisitorTokenPayload).ws === "string" &&
      typeof (json as VisitorTokenPayload).iat === "number"
    ) {
      return json as VisitorTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function hmac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function base64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function base64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}
