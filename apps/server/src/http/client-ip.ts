/**
 * 클라이언트 IP 추출 — 레이트리밋 키(04 §0.2: /session·로그인은 IP 기준).
 * 리버스 프록시 뒤를 가정해 x-forwarded-for 우선, 없으면 소켓 원격 주소.
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
