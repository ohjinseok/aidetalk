/**
 * 커넥터 "연결 테스트" — POST /v1/workspaces/:wsId/agents/:id/test.
 * 05_AGENT_PROTOCOL.md "연결 테스트": message.text="__aidetalk_ping__"로 실제 dispatch해 계약 검증.
 * 부수효과(메시지/이벤트/로그 저장) 없이 계약만 확인한다.
 */
import { decryptSecret } from "@aidetalk/db";
import { parseAgentResponse, type AgentRequest } from "@aidetalk/shared";

import type { AppContext } from "../context";
import { assertResolvesToPublicIp } from "../lib/agent-endpoint";
import { resolveSecretEncKeyMaterial } from "../lib/secret-enc-key";
import { postToAgent } from "./http";

/** 05 문서 지정 핑 텍스트. */
export const PING_TEXT = "__aidetalk_ping__";

export interface AgentTestResult {
  ok: boolean;
  latencyMs: number;
  response?: unknown;
  error?: string;
}

export interface TestableAgent {
  id: string;
  endpointUrl: string;
  secretEnc: string | null;
  timeoutMs: number;
}

/** 핑 dispatch로 커넥터 계약을 검증한다. 항상 200 본문(ok/error)으로 반환(throw 없음). */
export async function testAgentConnection(
  app: AppContext,
  workspaceId: string,
  agent: TestableAgent,
): Promise<AgentTestResult> {
  if (!agent.secretEnc) {
    return { ok: false, latencyMs: 0, error: "secret_unavailable" };
  }
  let secret: string;
  try {
    secret = decryptSecret(agent.secretEnc, resolveSecretEncKeyMaterial(app.env));
  } catch {
    return { ok: false, latencyMs: 0, error: "secret_decrypt_failed" };
  }

  if (app.env.EDITION === "cloud" && !app.env.ALLOW_INSECURE_AGENT_ENDPOINT) {
    try {
      await assertResolvesToPublicIp(new URL(agent.endpointUrl).hostname);
    } catch {
      return { ok: false, latencyMs: 0, error: "ssrf_blocked" };
    }
  }

  const now = new Date().toISOString();
  const request: AgentRequest = {
    version: "1",
    mode: "reply",
    conversation_id: "conv_test",
    message: { id: "msg_test", role: "visitor", text: PING_TEXT, created_at: now },
    history: [],
    visitor: { id: "vis_test", email: null, name: null, attributes: {}, page_url: "" },
    workspace: { id: workspaceId, metadata: {} },
  };

  const outcome = await postToAgent({
    endpointUrl: agent.endpointUrl,
    secret,
    rawBody: JSON.stringify(request),
    timeoutMs: agent.timeoutMs,
  });

  if (outcome.kind === "timeout") {
    return { ok: false, latencyMs: outcome.latencyMs, error: "timeout" };
  }
  if (outcome.kind === "http_error") {
    return { ok: false, latencyMs: outcome.latencyMs, error: `http_${outcome.status}` };
  }
  if (outcome.kind === "too_large") {
    return { ok: false, latencyMs: outcome.latencyMs, error: "response_too_large" };
  }
  if (outcome.kind === "bad_content_type") {
    return { ok: false, latencyMs: outcome.latencyMs, error: "bad_content_type" };
  }
  if (outcome.kind === "network_error") {
    return { ok: false, latencyMs: outcome.latencyMs, error: "network_error" };
  }
  if (!outcome.body.trim()) {
    return { ok: false, latencyMs: outcome.latencyMs, error: "empty_body" };
  }

  try {
    const response = parseAgentResponse("reply", JSON.parse(outcome.body));
    return { ok: true, latencyMs: outcome.latencyMs, response };
  } catch {
    return { ok: false, latencyMs: outcome.latencyMs, error: "bad_response" };
  }
}
