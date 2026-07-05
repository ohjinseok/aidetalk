/**
 * 전환 트래킹 API — 04_API_SPEC.md §2. S1(segment=s1_site) 전용(CLAUDE.md 규칙 10).
 * segment=s2_no_site 워크스페이스에는 이 두 엔드포인트가 존재하지 않는 것처럼 404.
 * ⚠️ attributedRevenueKrw 등 매출 수치는 항상 "상담 기여 매출(추정)" 맥락으로만 노출.
 */
import { AppError } from "@aidetalk/shared";
import { Hono, type Context } from "hono";

import type { HonoEnv } from "../../http/types";
import { serializeConversionEvent, serializeTrackedLink } from "../../lib/serialize";
import { buildTrackingSummary, parseTrackingRange } from "../../services/tracking";
import { getConvOr404 } from "./shared";

export function createWorkspaceTrackingRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 대화 상세 트래킹(링크·클릭·전환) — 04 §2.
  app.get("/:wsId/conversations/:id/tracking", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    await assertS1Segment(c);
    const conv = await getConvOr404(c, wsId, c.req.param("id"));
    const links = await ctx.repos.trackedLink.listByConversation(wsId, conv.id);
    const conversions = await ctx.repos.conversion.listByConversation(wsId, conv.id);
    return c.json({
      trackedLinks: links.map(serializeTrackedLink),
      conversions: conversions.map(serializeConversionEvent),
    });
  });

  // 워크스페이스 트래킹 요약(기간) — 04 §2. ⚠️ attributedRevenueKrw는 "상담 기여 매출(추정)".
  app.get("/:wsId/tracking/summary", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    await assertS1Segment(c);
    const { from, to } = parseTrackingRange(c.req.query("from"), c.req.query("to"));
    const summary = await buildTrackingSummary(ctx, wsId, from, to);
    return c.json(summary);
  });

  return app;
}

/**
 * 전환 트래킹 API는 S1(segment=s1_site) 전용 — S2는 마치 라우트가 없는 것처럼 404.
 * (CLAUDE.md 규칙 10 / 04 §2 "segment=s2_no_site면 전부 404")
 */
async function assertS1Segment(c: Context<HonoEnv>): Promise<void> {
  const ctx = c.get("ctx");
  const wsId = c.req.param("wsId")!;
  const workspace = await ctx.repos.workspace.getById(wsId);
  if (!workspace || workspace.segment === "s2_no_site") {
    throw AppError.of("not_found", "이 워크스페이스에는 트래킹 API가 없다.");
  }
}
