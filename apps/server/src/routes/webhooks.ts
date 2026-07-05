/**
 * 웹훅 API — 04_API_SPEC.md §2 웹훅 섹션(Should). 세션 쿠키 인증 + membership 검증(agents와 동일 신뢰 수준
 * — owner 제한 없음, 워크스페이스 멤버 누구나 관리 가능).
 * secret 원문은 등록 응답 1회만 노출 — agents와 동일 패턴(sha256 해시 + AES-GCM 암호문).
 */
import { encryptSecret } from "@aidetalk/db";
import { AppError, createWebhookRequestSchema, type CreateWebhookRequest } from "@aidetalk/shared";
import { Hono } from "hono";

import { requireMembership, requireUser, validateJson, validated } from "../http/middleware";
import type { HonoEnv } from "../http/types";
import { endpointPolicy, validateAgentEndpoint } from "../lib/agent-endpoint";
import { resolveSecretEncKeyMaterial } from "../lib/secret-enc-key";
import { serializeWebhook } from "../lib/serialize";
import { generateWebhookSecret } from "../lib/webhook-secret";

export function createWebhookRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  app.use("/*", requireUser);
  app.use("/:wsId/*", requireMembership);

  // 등록 — secret 원문은 이 응답 1회만(agents와 동일 패턴, 04 §2).
  app.post("/:wsId/webhooks", validateJson(createWebhookRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const body = validated<CreateWebhookRequest>(c);

    // SSRF 가드/https 정책은 agent endpoint와 동일 공유 유틸(08 §7 "SSRF 가드 공유 유틸 사용").
    const url = await validateAgentEndpoint(body.url, endpointPolicy(ctx.env));
    const secret = generateWebhookSecret();
    const secretEnc = encryptSecret(secret, resolveSecretEncKeyMaterial(ctx.env));

    const webhook = await ctx.repos.webhook.create(wsId, {
      url,
      events: body.events,
      secret,
      secretEnc,
    });
    return c.json({ webhook: serializeWebhook(webhook), secret }, 201);
  });

  // 목록.
  app.get("/:wsId/webhooks", async (c) => {
    const ctx = c.get("ctx");
    const rows = await ctx.repos.webhook.list(c.req.param("wsId"));
    return c.json({ items: rows.map(serializeWebhook) });
  });

  // 삭제.
  app.delete("/:wsId/webhooks/:id", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const id = c.req.param("id");
    const existing = await ctx.repos.webhook.getById(wsId, id);
    if (!existing) throw AppError.of("not_found", "웹훅을 찾을 수 없다.");
    await ctx.repos.webhook.remove(wsId, id);
    return c.body(null, 204);
  });

  return app;
}
