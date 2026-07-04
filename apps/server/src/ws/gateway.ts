/**
 * WS 게이트웨이 — 04_API_SPEC.md §5. 연결 레지스트리 + PubSub fan-out.
 *
 * 채널 격리(§5.5 / 08 §3 불변식 3):
 *  - visitor 소켓은 conv:{id}:all만 구독. conv:{id}:agents는 절대 구독하지 않는다.
 *  - agent 소켓은 subscribe.workspace로 ws:{id}:inbox, subscribe.conversation으로
 *    conv:{id}:all + conv:{id}:agents를 구독.
 *  - fanout 시에도 방어적으로 visitor에게는 suggestion.new / 자기 자신의 message.new를 제외.
 */
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import {
  dashboardToServerMessageSchema,
  widgetToServerMessageSchema,
  wsEnvelopeSchema,
} from "@aidetalk/shared";
import { AppError } from "@aidetalk/shared";
import { WebSocket, WebSocketServer } from "ws";

import type { AppContext } from "../context";
import { channels, isAgentsChannel } from "../pubsub/channels";
import { verifyVisitorToken } from "../lib/visitor-token";
import {
  sendVisitorMessage,
  VISITOR_MSG_LIMIT,
  VISITOR_MSG_WINDOW_SEC,
} from "../services/messaging";
import { SESSION_COOKIE } from "../http/middleware";

interface Conn {
  id: string;
  ws: WebSocket;
  kind: "visitor" | "agent";
  workspaceId: string; // visitor 전용. agent는 다중 워크스페이스라 빈 문자열.
  visitorId?: string;
  userId?: string;
  subscriptions: Set<string>;
  missedPings: number;
  /** 인바운드 처리 직렬화 큐 — 같은 소켓의 메시지를 도착 순서대로 처리해 저장 순서를 보장(09 §2). */
  tail: Promise<void>;
}

/** WS 종료 코드 — 인증 실패(04 §5). */
const CLOSE_UNAUTHORIZED = 4401;
const PING_INTERVAL_MS = 30_000;
const MAX_MISSED_PINGS = 2;

export interface Gateway {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  /** 테스트/종료용 — 활성 연결 수. */
  connectionCount(): number;
  close(): Promise<void>;
}

export function createGateway(ctx: AppContext): Gateway {
  const wss = new WebSocketServer({ noServer: true });
  const connections = new Map<string, Conn>();
  const channelSubs = new Map<string, Set<string>>();
  const channelUnsub = new Map<string, Promise<() => void>>();

  // ---------- 채널 구독/해제(참조 카운트) ----------
  async function subscribe(conn: Conn, channel: string): Promise<void> {
    if (conn.subscriptions.has(channel)) return;
    conn.subscriptions.add(channel);
    let set = channelSubs.get(channel);
    if (!set) {
      set = new Set();
      channelSubs.set(channel, set);
    }
    set.add(conn.id);
    if (!channelUnsub.has(channel)) {
      channelUnsub.set(
        channel,
        ctx.pubsub.subscribe(channel, (msg) => fanout(channel, msg)),
      );
    }
    await channelUnsub.get(channel);
  }

  async function unsubscribe(conn: Conn, channel: string): Promise<void> {
    if (!conn.subscriptions.delete(channel)) return;
    const set = channelSubs.get(channel);
    if (!set) return;
    set.delete(conn.id);
    if (set.size === 0) {
      channelSubs.delete(channel);
      const p = channelUnsub.get(channel);
      channelUnsub.delete(channel);
      if (p) {
        try {
          (await p)();
        } catch {
          /* unsubscribe 실패는 무시 */
        }
      }
    }
  }

  // ---------- fan-out ----------
  function fanout(channel: string, raw: string): void {
    const set = channelSubs.get(channel);
    if (!set) return;
    let env: { type?: string; payload?: unknown };
    try {
      env = JSON.parse(raw);
    } catch {
      return;
    }
    for (const connId of set) {
      const conn = connections.get(connId);
      if (!conn) continue;
      if (!shouldDeliver(conn, channel, env)) continue;
      sendRaw(conn, raw);
    }
  }

  /** 자격별 가시성 필터 — visitor에게 상담원 전용 이벤트/자기 메시지 미전달. */
  function shouldDeliver(
    conn: Conn,
    channel: string,
    env: { type?: string; payload?: unknown },
  ): boolean {
    if (conn.kind === "visitor") {
      // 방어선: visitor는 agents 채널을 구독하지 않지만 이중으로 차단.
      if (isAgentsChannel(channel)) return false;
      if (env.type === "suggestion.new") return false;
      // 자기 자신의 손님 메시지 echo 제외(ack로 이미 처리됨).
      if (env.type === "message.new") {
        const role = (env.payload as { message?: { role?: string } } | undefined)?.message?.role;
        if (role === "visitor") return false;
      }
    }
    return true;
  }

  function sendRaw(conn: Conn, raw: string): void {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(raw);
  }

  function sendEnvelope(conn: Conn, type: string, payload: unknown): void {
    sendRaw(conn, JSON.stringify({ type, payload }));
  }

  function sendError(conn: Conn, code: string, message: string, ref?: string): void {
    sendEnvelope(conn, "error", ref ? { code, message, ref } : { code, message });
  }

  // ---------- 업그레이드 인증 ----------
  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (path !== "/ws/visitor" && path !== "/ws/agent") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      void authAndRegister(ws, path, req, url);
    });
  }

  async function authAndRegister(
    ws: WebSocket,
    path: string,
    req: IncomingMessage,
    url: URL,
  ): Promise<void> {
    let conn: Conn | null = null;

    if (path === "/ws/visitor") {
      const token = url.searchParams.get("token");
      const payload = token ? verifyVisitorToken(token, ctx.env.VISITOR_TOKEN_SECRET) : null;
      if (payload) {
        conn = newConn(ws, "visitor", { workspaceId: payload.ws, visitorId: payload.vis });
      }
    } else {
      // /ws/agent — od_session 쿠키.
      const sessionId = parseCookie(req.headers.cookie, SESSION_COOKIE);
      const userId = sessionId ? await ctx.sessionStore.get(sessionId) : null;
      if (userId) {
        conn = newConn(ws, "agent", { userId });
      }
    }

    if (!conn) {
      // 인증 실패 → 4401 close(04 §5).
      ws.close(CLOSE_UNAUTHORIZED, "unauthorized");
      return;
    }

    register(conn);
  }

  function newConn(
    ws: WebSocket,
    kind: "visitor" | "agent",
    extra: { workspaceId?: string; visitorId?: string; userId?: string },
  ): Conn {
    return {
      id: `conn_${randomBytes(9).toString("base64url")}`,
      ws,
      kind,
      workspaceId: extra.workspaceId ?? "",
      visitorId: extra.visitorId,
      userId: extra.userId,
      subscriptions: new Set(),
      missedPings: 0,
      tail: Promise.resolve(),
    };
  }

  function register(conn: Conn): void {
    connections.set(conn.id, conn);
    conn.ws.on("pong", () => {
      conn.missedPings = 0;
    });
    conn.ws.on("message", (data) => {
      // 같은 소켓의 메시지를 순차 처리 — 연속 message.send의 저장 순서(createdAt) 역전 방지.
      const raw = data.toString();
      conn.tail = conn.tail.then(() => handleMessage(conn, raw)).catch(() => undefined);
    });
    conn.ws.on("close", () => {
      void cleanup(conn);
    });
    conn.ws.on("error", () => {
      void cleanup(conn);
    });
  }

  async function cleanup(conn: Conn): Promise<void> {
    if (!connections.has(conn.id)) return;
    connections.delete(conn.id);
    for (const channel of [...conn.subscriptions]) await unsubscribe(conn, channel);
  }

  // ---------- 인바운드 메시지 ----------
  async function handleMessage(conn: Conn, raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return; // 비-JSON 무시
    }
    const env = wsEnvelopeSchema.safeParse(json);
    if (!env.success) return;

    try {
      if (conn.kind === "visitor") {
        await handleVisitorMessage(conn, json);
      } else {
        await handleAgentMessage(conn, json);
      }
    } catch (err) {
      if (err instanceof AppError) {
        sendError(conn, err.code, err.message);
      } else {
        ctx.logger.error({ err: (err as Error).message }, "ws message handler error");
        sendError(conn, "not_found", "요청을 처리할 수 없다.");
      }
    }
  }

  async function handleVisitorMessage(conn: Conn, json: unknown): Promise<void> {
    const parsed = widgetToServerMessageSchema.safeParse(json);
    if (!parsed.success) return; // 알 수 없는/잘못된 type 무시(전방 호환)
    const msg = parsed.data;
    const visitor = { visitorId: conn.visitorId!, workspaceId: conn.workspaceId };

    switch (msg.type) {
      case "message.send": {
        const rl = await ctx.rateLimiter.hit(
          `msg:${conn.visitorId}`,
          VISITOR_MSG_LIMIT,
          VISITOR_MSG_WINDOW_SEC,
        );
        if (!rl.allowed) {
          sendError(conn, "rate/limited", "메시지 전송이 너무 잦다.");
          return;
        }
        // 발신 전에 conv:all 구독 → 이후 상대(AI/상담원) 메시지 수신.
        await subscribe(conn, channels.convAll(msg.payload.conversationId));
        const message = await sendVisitorMessage(ctx, {
          visitor,
          conversationId: msg.payload.conversationId,
          clientMsgId: msg.payload.clientMsgId,
          text: msg.payload.text,
        });
        // 저장 확정 ack(중복이면 기존 메시지로 ack — 멱등).
        sendEnvelope(conn, "message.ack", { clientMsgId: msg.payload.clientMsgId, message });
        return;
      }
      case "conversation.subscribe": {
        // 소유 검증 후 conv:all만 구독(어시스트 채널은 절대 구독하지 않음 — 규칙 9).
        await assertVisitorOwns(visitor, msg.payload.conversationId);
        await subscribe(conn, channels.convAll(msg.payload.conversationId));
        return;
      }
      case "typing.set": {
        // 손님 타이핑 → 상담원 화면 표시.
        // TODO(question): 04 §5.4에 visitor→dashboard 타이핑 WS 타입이 없다.
        //   by 열거형은 ai|human뿐이라 손님 타이핑을 표현할 스키마가 없어 이번 웨이브는 미전달.
        await assertVisitorOwns(visitor, msg.payload.conversationId);
        return;
      }
      case "read.mark": {
        // TODO(question): 읽음 상태 저장 모델이 03 스키마에 없어 이번 웨이브는 수용 후 무동작.
        await assertVisitorOwns(visitor, msg.payload.conversationId);
        return;
      }
    }
  }

  async function assertVisitorOwns(
    visitor: { visitorId: string; workspaceId: string },
    conversationId: string,
  ): Promise<void> {
    const conv = await ctx.repos.conversation.getById(visitor.workspaceId, conversationId);
    if (!conv || conv.visitorId !== visitor.visitorId) {
      throw AppError.of("not_found", "대화를 찾을 수 없다.");
    }
  }

  async function handleAgentMessage(conn: Conn, json: unknown): Promise<void> {
    const parsed = dashboardToServerMessageSchema.safeParse(json);
    if (!parsed.success) return;
    const msg = parsed.data;
    const userId = conn.userId!;

    switch (msg.type) {
      case "subscribe.workspace": {
        const role = await ctx.repos.member.getRole(msg.payload.workspaceId, userId);
        if (!role) {
          sendError(conn, "auth/forbidden", "이 워크스페이스에 접근할 권한이 없다.");
          return;
        }
        await subscribe(conn, channels.wsInbox(msg.payload.workspaceId));
        return;
      }
      case "subscribe.conversation": {
        const wsId = await findMemberWorkspaceOfConversation(
          userId,
          msg.payload.conversationId,
        );
        if (!wsId) {
          sendError(conn, "auth/forbidden", "이 대화에 접근할 권한이 없다.");
          return;
        }
        // 상담원은 conv:all(공용) + conv:agents(어시스트) 둘 다 구독.
        await subscribe(conn, channels.convAll(msg.payload.conversationId));
        await subscribe(conn, channels.convAgents(msg.payload.conversationId));
        return;
      }
      case "unsubscribe.conversation": {
        await unsubscribe(conn, channels.convAll(msg.payload.conversationId));
        await unsubscribe(conn, channels.convAgents(msg.payload.conversationId));
        return;
      }
      case "typing.set": {
        const wsId = await findMemberWorkspaceOfConversation(
          userId,
          msg.payload.conversationId,
        );
        if (!wsId) return;
        await ctx.broadcaster.typing(msg.payload.conversationId, "human", msg.payload.isTyping);
        return;
      }
    }
  }

  /** 대화가 이 사용자가 멤버인 워크스페이스에 속하는지 확인 → 워크스페이스 id 또는 null. */
  async function findMemberWorkspaceOfConversation(
    userId: string,
    conversationId: string,
  ): Promise<string | null> {
    const memberships = await ctx.repos.member.listByUser(userId);
    for (const m of memberships) {
      const conv = await ctx.repos.conversation.getById(m.workspaceId, conversationId);
      if (conv) return m.workspaceId;
    }
    return null;
  }

  // ---------- ping/pong keepalive ----------
  const pingTimer = setInterval(() => {
    for (const conn of connections.values()) {
      if (conn.missedPings >= MAX_MISSED_PINGS) {
        conn.ws.terminate();
        void cleanup(conn);
        continue;
      }
      conn.missedPings += 1;
      try {
        conn.ws.ping();
      } catch {
        /* ping 실패 시 다음 주기에 정리 */
      }
    }
  }, PING_INTERVAL_MS);
  pingTimer.unref?.();

  return {
    handleUpgrade,
    connectionCount: () => connections.size,
    async close() {
      clearInterval(pingTimer);
      for (const conn of connections.values()) conn.ws.terminate();
      connections.clear();
      wss.close();
    },
  };
}

/** 쿠키 헤더에서 특정 쿠키 값 추출. */
function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
