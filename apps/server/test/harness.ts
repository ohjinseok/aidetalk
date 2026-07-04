/**
 * 통합 테스트 하니스 — 실제 Postgres + 메모리 어댑터로 서버(HTTP+WS)를 기동한다.
 * PUBSUB/세션/레이트리밋은 메모리 드라이버(과제 지정). WS는 실제 소켓으로 통합 테스트.
 */
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { serve } from "@hono/node-server";
import { createDbConnection, encryptSecret, type DbConnection } from "@aidetalk/db";
import { WebSocket } from "ws";

import type { HttpAgentDispatcher } from "../src/dispatcher";

import { createApp } from "../src/app";
import { createContext } from "../src/context";
import { parseEnv, type Env } from "../src/env";
import { createLogger } from "../src/logger";
import { createMemoryPubSub } from "../src/pubsub/memory";
import { createMemoryRateLimiter } from "../src/ratelimit";
import { createMemorySessionStore } from "../src/session/store";
import { createGateway, type Gateway } from "../src/ws/gateway";
import type { AppContext } from "../src/context";
import { TEST_DATABASE_URL } from "./pg";

export const TEST_VISITOR_SECRET = "test_visitor_secret_at_least_16_chars";
export const TEST_SESSION_SECRET = "test_session_secret_at_least_16_chars";

export function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): Env {
  return parseEnv({
    DATABASE_URL: TEST_DATABASE_URL,
    PUBSUB_DRIVER: "memory",
    SERVER_URL: "http://localhost:4000",
    DASHBOARD_URL: "http://localhost:3000",
    VISITOR_TOKEN_SECRET: TEST_VISITOR_SECRET,
    SESSION_SECRET: TEST_SESSION_SECRET,
    LOG_LEVEL: "silent",
    ...overrides,
  } as NodeJS.ProcessEnv);
}

export interface Harness {
  ctx: AppContext;
  gateway: Gateway;
  baseUrl: string;
  wsBase: string;
  close(): Promise<void>;
}

export async function createHarness(
  envOverrides: Partial<NodeJS.ProcessEnv> = {},
): Promise<Harness> {
  const env = testEnv(envOverrides);
  const conn: DbConnection = createDbConnection(TEST_DATABASE_URL);
  const pubsub = createMemoryPubSub();
  const rateLimiter = createMemoryRateLimiter();
  const sessionStore = createMemorySessionStore();
  const logger = createLogger("silent");

  const ctx = createContext({ env, db: conn.db, pubsub, rateLimiter, sessionStore, logger });
  const app = createApp(ctx);
  const gateway = createGateway(ctx);

  const server = serve({ fetch: app.fetch, port: 0 });
  await once(server, "listening");
  server.on("upgrade", (req, socket, head) => gateway.handleUpgrade(req, socket, head));
  const { port } = server.address() as AddressInfo;

  return {
    ctx,
    gateway,
    baseUrl: `http://localhost:${port}`,
    wsBase: `ws://localhost:${port}`,
    async close() {
      await gateway.close();
      await new Promise<void>((res) => server.close(() => res()));
      await pubsub.close();
      await rateLimiter.close();
      await sessionStore.close();
      await conn.close();
    },
  };
}

// ---------- HTTP 헬퍼 ----------
export interface HttpResult {
  status: number;
  json: any;
  headers: Headers;
}

export async function http(
  h: Harness,
  method: string,
  path: string,
  opts: { token?: string; cookie?: string; body?: unknown } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.cookie) headers["cookie"] = opts.cookie;
  const res = await fetch(`${h.baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json, headers: res.headers };
}

/** 워크스페이스 + visitor 세션 발급 → 토큰/워크스페이스/방문자 반환. */
export async function newVisitorSession(
  h: Harness,
  opts: { segment?: "s1_site" | "s2_no_site"; widgetSettings?: Record<string, unknown> } = {},
): Promise<{ workspaceId: string; token: string; visitorId: string }> {
  const ws = await h.ctx.repos.workspace.create({
    name: "테스트 워크스페이스",
    segment: opts.segment ?? "s1_site",
    widgetSettings: opts.widgetSettings,
  });
  const res = await http(h, "POST", "/v1/widget/session", { body: { workspaceId: ws.id } });
  return { workspaceId: ws.id, token: res.json.visitorToken, visitorId: res.json.visitor.id };
}

/** 새 대화 생성 → conversationId. */
export async function newConversation(h: Harness, token: string): Promise<string> {
  const res = await http(h, "POST", "/v1/widget/conversations", { token, body: {} });
  return res.json.conversation.id;
}

/** 알려진 secret으로 워크스페이스에 active 커넥터 등록(dispatch/서명 테스트용). */
export async function registerMockAgent(
  h: Harness,
  workspaceId: string,
  endpointUrl: string,
  opts: { secret?: string; timeoutMs?: number; assistEnabled?: boolean } = {},
): Promise<{ agentId: string; secret: string }> {
  const secret = opts.secret ?? "adt_test_secret_abcdefghijklmnop";
  const secretEnc = encryptSecret(secret, TEST_SESSION_SECRET);
  const agent = await h.ctx.repos.agent.create(workspaceId, {
    name: "mock-agent",
    endpointUrl,
    secret,
    secretEnc,
    timeoutMs: opts.timeoutMs ?? 30000,
    assistEnabled: opts.assistEnabled ?? true,
  });
  return { agentId: agent.id, secret };
}

/** 진행 중 dispatch 완료 대기(결정성). */
export async function drainDispatch(h: Harness): Promise<void> {
  await (h.ctx.dispatcher as HttpAgentDispatcher).whenIdle?.();
}

/** 유저 + 활성 멤버십 + 세션 쿠키 생성. */
export async function newUserWithWorkspace(
  h: Harness,
  workspaceId?: string,
): Promise<{ userId: string; cookie: string; workspaceId: string }> {
  const email = `u_${Math.random().toString(36).slice(2)}@example.com`;
  const user = await h.ctx.repos.user.create({ email, password: "password123", name: "상담원" });
  let wsId = workspaceId;
  if (!wsId) {
    const ws = await h.ctx.repos.workspace.create({ name: "WS", segment: "s1_site" });
    wsId = ws.id;
  }
  await h.ctx.repos.member.addActive(wsId, user.id, "owner");
  const sessionId = await h.ctx.sessionStore.create(user.id);
  return { userId: user.id, cookie: `od_session=${sessionId}`, workspaceId: wsId };
}

// ---------- WS 클라이언트 헬퍼 ----------
export class WsClient {
  private socket: WebSocket;
  private queue: any[] = [];
  private waiters: { match: (m: any) => boolean; resolve: (m: any) => void }[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      const idx = this.waiters.findIndex((w) => w.match(msg));
      if (idx >= 0) {
        const [w] = this.waiters.splice(idx, 1);
        w?.resolve(msg);
      } else {
        this.queue.push(msg);
      }
    });
  }

  static async connect(url: string, headers?: Record<string, string>): Promise<WsClient> {
    const socket = new WebSocket(url, headers ? { headers } : undefined);
    await once(socket, "open");
    return new WsClient(socket);
  }

  send(type: string, payload: unknown): void {
    this.socket.send(JSON.stringify({ type, payload }));
  }

  /** 조건에 맞는 다음 메시지를 기다린다(이미 큐에 있으면 즉시). */
  next(match: (m: any) => boolean, timeoutMs = 3000): Promise<any> {
    const idx = this.queue.findIndex(match);
    if (idx >= 0) return Promise.resolve(this.queue.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ws next() 타임아웃")), timeoutMs);
      this.waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  nextType(type: string, timeoutMs = 3000): Promise<any> {
    return this.next((m) => m.type === type, timeoutMs);
  }

  /** 지정 시간 동안 조건에 맞는 메시지가 오지 않음을 보장(격리 검증용). */
  async expectNone(match: (m: any) => boolean, windowMs = 500): Promise<void> {
    await new Promise((r) => setTimeout(r, windowMs));
    if (this.queue.some(match)) throw new Error("수신되면 안 되는 메시지를 받았다");
  }

  received(): any[] {
    return [...this.queue];
  }

  close(): void {
    this.socket.close();
  }

  async closed(): Promise<number> {
    const [code] = (await once(this.socket, "close")) as [number];
    return code;
  }
}
