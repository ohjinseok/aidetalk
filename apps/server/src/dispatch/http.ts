/**
 * Agent dispatch의 아웃바운드 HTTP — 05_AGENT_PROTOCOL.md / 08_SECURITY.md §2.
 * - HMAC-SHA256(timestamp + "." + raw_body), X-AideTalk-Timestamp/Signature 헤더.
 * - 타임아웃(agents.timeoutMs), 응답 64KB 제한, 재시도 없음, redirect 미추적.
 */
import { createHmac } from "node:crypto";

/** 응답 본문 상한 — 08 §2 (64KB 초과 시 에러 처리). */
export const MAX_RESPONSE_BYTES = 64 * 1024;

export interface SignedHeaders {
  timestamp: string;
  signature: string;
}

/** timestamp.raw_body를 secret으로 HMAC-SHA256 서명(hex). */
export function signBody(secret: string, rawBody: string, timestampSec: number): SignedHeaders {
  const timestamp = String(timestampSec);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return { timestamp, signature };
}

export type DispatchOutcome =
  | { kind: "ok"; status: number; body: string; latencyMs: number }
  | { kind: "timeout"; latencyMs: number }
  | { kind: "http_error"; status: number; latencyMs: number }
  | { kind: "too_large"; latencyMs: number }
  | { kind: "network_error"; message: string; latencyMs: number };

export interface PostAgentInput {
  endpointUrl: string;
  secret: string;
  rawBody: string;
  timeoutMs: number;
}

/**
 * 유저 endpoint로 서명된 POST를 1회 보낸다(재시도 없음).
 * 타임아웃/5xx/연결 실패/64KB 초과를 호출측이 구분해 처리할 수 있도록 DispatchOutcome으로 반환.
 */
export async function postToAgent(input: PostAgentInput): Promise<DispatchOutcome> {
  const started = Date.now();
  const timestampSec = Math.floor(started / 1000);
  const { timestamp, signature } = signBody(input.secret, input.rawBody, timestampSec);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const res = await fetch(input.endpointUrl, {
      method: "POST",
      redirect: "manual", // redirect 미추적(08 §2)
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-aidetalk-timestamp": timestamp,
        "x-aidetalk-signature": signature,
      },
      body: input.rawBody,
    });
    const latencyMs = Date.now() - started;

    // 3xx(redirect)와 5xx는 에러로 처리. 4xx도 계약 위반이므로 http_error.
    if (res.status >= 300) {
      return { kind: "http_error", status: res.status, latencyMs };
    }

    const body = await readLimited(res, MAX_RESPONSE_BYTES);
    if (body === null) {
      return { kind: "too_large", latencyMs };
    }
    return { kind: "ok", status: res.status, body, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (controller.signal.aborted) return { kind: "timeout", latencyMs };
    return { kind: "network_error", message: (err as Error).message, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

/** 응답 본문을 maxBytes까지만 읽는다. 초과하면 null(호출측이 too_large 처리). */
async function readLimited(res: Response, maxBytes: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
