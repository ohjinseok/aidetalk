/**
 * Agent 커넥터 API — 04_API_SPEC.md §2. 등록/목록/수정/secret 재발급/연결 테스트 + AI 로그.
 * secret 원문은 생성·재발급 응답 1회만 노출(sha256 해시 + AES-GCM 암호문만 저장, 규칙 5).
 */
import { encryptSecret } from "@aidetalk/db";
import { AppError } from "@aidetalk/shared";
import { Hono } from "hono";

import { testAgentConnection } from "../../dispatch/test";
import { validateJson, validated } from "../../http/middleware";
import {
  createAgentRequestSchema,
  updateAgentRequestSchema,
  type CreateAgentRequest,
  type UpdateAgentRequest,
} from "../../http/schemas";
import type { HonoEnv } from "../../http/types";
import { generateAgentSecret } from "../../lib/agent-secret";
import { endpointPolicy, validateAgentEndpoint } from "../../lib/agent-endpoint";
import { clampLimit, decodeCursor, encodeCursor } from "../../lib/cursor";
import { resolveSecretEncKeyMaterial } from "../../lib/secret-enc-key";
import { serializeAgent, serializeAgentLog } from "../../lib/serialize";

export function createAgentRoutes(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>();

  // 등록 — secret 원문은 이 응답 1회만.
  app.post("/:wsId/agents", validateJson(createAgentRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const body = validated<CreateAgentRequest>(c);

    const endpointUrl = await validateAgentEndpoint(body.endpointUrl, endpointPolicy(ctx.env));
    const secret = generateAgentSecret();
    const secretEnc = encryptSecret(secret, resolveSecretEncKeyMaterial(ctx.env));

    const agent = await ctx.repos.agent.create(wsId, {
      name: body.name,
      endpointUrl,
      secret,
      secretEnc,
      timeoutMs: body.timeoutMs,
    });
    // ⚠️ secret 원문은 응답 1회만. 이후 조회 불가.
    return c.json({ agent: serializeAgent(agent), secret }, 201);
  });

  // 목록.
  app.get("/:wsId/agents", async (c) => {
    const ctx = c.get("ctx");
    const rows = await ctx.repos.agent.list(c.req.param("wsId"));
    return c.json({ items: rows.map(serializeAgent) });
  });

  // 수정 — active 전환 시 기존 active 자동 disabled(1개 제약).
  app.patch("/:wsId/agents/:id", validateJson(updateAgentRequestSchema), async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.param("id");
    const body = validated<UpdateAgentRequest>(c);

    const existing = await ctx.repos.agent.getById(wsId, agentId);
    if (!existing) throw AppError.of("not_found", "커넥터를 찾을 수 없다.");

    // 필드 갱신(endpointUrl 변경 시 재검증).
    const patch: { name?: string; endpointUrl?: string; timeoutMs?: number; assistEnabled?: boolean } =
      {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.timeoutMs !== undefined) patch.timeoutMs = body.timeoutMs;
    if (body.assistEnabled !== undefined) patch.assistEnabled = body.assistEnabled;
    if (body.endpointUrl !== undefined) {
      patch.endpointUrl = await validateAgentEndpoint(body.endpointUrl, endpointPolicy(ctx.env));
    }
    if (Object.keys(patch).length > 0) {
      await ctx.repos.agent.update(wsId, agentId, patch);
    }

    // status 전환.
    if (body.status !== undefined) {
      if (body.status === "active") {
        // 기존 active(자기 자신 제외)를 먼저 disabled 처리(자동 1개 제약).
        const current = await ctx.repos.agent.getActive(wsId);
        if (current && current.id !== agentId) {
          await ctx.repos.agent.setStatus(wsId, current.id, "disabled");
        }
        await ctx.repos.agent.setStatus(wsId, agentId, "active");
      } else {
        await ctx.repos.agent.setStatus(wsId, agentId, "disabled");
      }
    }

    const updated = await ctx.repos.agent.getById(wsId, agentId);
    return c.json({ agent: serializeAgent(updated!) });
  });

  // secret 재발급 — 새 secret 1회 노출.
  app.post("/:wsId/agents/:id/rotate-secret", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.param("id");
    const existing = await ctx.repos.agent.getById(wsId, agentId);
    if (!existing) throw AppError.of("not_found", "커넥터를 찾을 수 없다.");

    const secret = generateAgentSecret();
    const secretEnc = encryptSecret(secret, resolveSecretEncKeyMaterial(ctx.env));
    await ctx.repos.agent.rotateSecret(wsId, agentId, secret, secretEnc);
    return c.json({ secret });
  });

  // 연결 테스트 — 실제 dispatch.
  app.post("/:wsId/agents/:id/test", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.param("id");
    const agent = await ctx.repos.agent.getById(wsId, agentId);
    if (!agent) throw AppError.of("not_found", "커넥터를 찾을 수 없다.");

    const result = await testAgentConnection(ctx, wsId, {
      id: agent.id,
      endpointUrl: agent.endpointUrl,
      secretEnc: agent.secretEnc,
      timeoutMs: agent.timeoutMs,
    });
    return c.json(result);
  });

  // AI 로그 목록.
  app.get("/:wsId/agent-logs", async (c) => {
    const ctx = c.get("ctx");
    const wsId = c.req.param("wsId");
    const agentId = c.req.query("agentId");
    if (!agentId) throw AppError.of("validation/failed", "agentId 쿼리가 필요하다.");

    const cursor = decodeCursor(c.req.query("cursor"));
    const limit = clampLimit(c.req.query("limit"), 50, 100);
    const rows = await ctx.repos.agentLog.listByAgent(wsId, agentId, cursor, limit);
    const items = rows.map(serializeAgentLog);
    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? encodeCursor(last) : null;
    return c.json({ items, nextCursor });
  });

  return app;
}
