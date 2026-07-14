/**
 * 클라이언트 IP 추출 — 레이트리밋 키(04 §0.2: /session·로그인은 IP 기준).
 * 리버스 프록시 뒤를 가정해 x-forwarded-for 우선, 없으면 소켓 원격 주소.
 *
 * 신뢰 모델: XFF의 "첫 값"을 그대로 신뢰한다. 이건 프록시가 XFF를 **덮어쓸 때만** 안전하다.
 * - 우리 표준 배포(docker/Caddyfile)는 프록시가 Caddy 하나뿐이고, 모든 reverse_proxy에서
 *   `header_up X-Forwarded-For {remote_host}`로 클라이언트가 보낸 값을 덮어쓴다 → 첫 값 = 실제 소켓 IP.
 * - 값을 append하는 프록시(기본 동작) 뒤에 두면 클라이언트가 XFF를 위조해 IP 레이트리밋을 우회할 수 있다.
 *   자체 리버스 프록시를 쓰는 셀프호스터는 반드시 XFF를 set(덮어쓰기)하도록 구성해야 한다
 *   — docs/10_DEPLOYMENT.md §2 "기존 리버스 프록시 사용자".
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

import type { HonoEnv } from "./types";

export function getClientIp(c: Context<HonoEnv>): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
