/**
 * 모의 에이전트 서버 — 09_TESTING.md §8.
 * setBehavior({ status?, delayMs?, response?, raw? })로 시나리오(고정 응답/지연/에러/오버사이즈)를 주입한다.
 * 수신한 요청(헤더·rawBody)을 기록해 HMAC 서명 검증 테스트에 사용한다.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface MockAgentBehavior {
  /** HTTP 상태(기본 200). */
  status?: number;
  /** 응답 전 지연(ms) — 타임아웃 유발용. */
  delayMs?: number;
  /** JSON 응답 본문(객체). */
  response?: unknown;
  /** 원시 응답 본문(스키마 불일치/빈 body/오버사이즈 주입용). response보다 우선. */
  raw?: string;
}

export interface CapturedRequest {
  headers: Record<string, string>;
  rawBody: string;
  json: unknown;
}

export interface MockAgent {
  url: string;
  setBehavior(b: MockAgentBehavior): void;
  /** 마지막으로 수신한 요청(없으면 null). */
  lastRequest(): CapturedRequest | null;
  /** 지금까지 수신한 요청 수. */
  requestCount(): number;
  close(): Promise<void>;
}

export async function startMockAgent(initial: MockAgentBehavior = {}): Promise<MockAgent> {
  let behavior: MockAgentBehavior = { ...initial };
  const captured: CapturedRequest[] = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let json: unknown = null;
      try {
        json = JSON.parse(rawBody);
      } catch {
        json = null;
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        headers[k] = Array.isArray(v) ? v.join(",") : (v ?? "");
      }
      captured.push({ headers, rawBody, json });

      const send = () => {
        const status = behavior.status ?? 200;
        const body =
          behavior.raw !== undefined
            ? behavior.raw
            : JSON.stringify(behavior.response ?? { type: "reply", text: "pong" });
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body);
      };
      if (behavior.delayMs && behavior.delayMs > 0) {
        setTimeout(send, behavior.delayMs);
      } else {
        send();
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/agent`,
    setBehavior(b) {
      behavior = { ...b };
    },
    lastRequest: () => captured[captured.length - 1] ?? null,
    requestCount: () => captured.length,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
