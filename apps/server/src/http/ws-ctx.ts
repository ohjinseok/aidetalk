/**
 * 워크스페이스 라우트 공용 접근자 — 매 핸들러가 반복하던
 * `const ctx = c.get("ctx"); const wsId = c.req.param("wsId");` 보일러플레이트를 한 곳으로.
 * `/:wsId` 접두사 아래 마운트된 라우트에서만 사용한다(wsId 존재를 전제).
 */
import type { Context } from "hono";

import type { AppContext } from "../context";
import type { HonoEnv } from "./types";

/** 요청에서 AppContext와 :wsId 경로 파라미터를 함께 꺼낸다. */
export function getWsCtx(c: Context<HonoEnv>): { ctx: AppContext; wsId: string } {
  // :wsId 접두사 라우트 전제 — 파라미터는 항상 존재한다.
  return { ctx: c.get("ctx"), wsId: c.req.param("wsId")! };
}
