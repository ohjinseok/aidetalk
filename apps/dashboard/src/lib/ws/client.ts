/**
 * 대시보드 WebSocket 클라이언트 — 04 §5.3/5.4 `/ws/agent`.
 * 재연결(지수 백오프) + 구독 상태 복원 + 서버→대시보드 이벤트 파싱(알 수 없는 type 무시).
 *
 * TODO(question): `/ws/agent`는 쿠키 인증(04 §5)인데, Next rewrites는 WS 업그레이드를 프록시하지
 * 못한다. 크로스 오리진 WS로 od_session 쿠키를 실어 보내려면 서버/대시보드 동일 오리진 배포거나
 * 별도 WS 티켓이 필요하다. 지금은 NEXT_PUBLIC_WS_URL로 직접 접속하며, 실제 인증 연동은 통합 웨이브.
 */
import {
  serverToDashboardMessageSchema,
  type DashboardToServerMessage,
  type ServerToDashboardMessage,
} from "@aidetalk/shared";

/** 재연결 백오프(ms) — attempt 0부터. 1s → 30s 상한. 순수 함수(테스트 대상). */
export function nextBackoff(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  const raw = baseMs * 2 ** attempt;
  return Math.min(raw, maxMs);
}

export type WsStatus = "connecting" | "open" | "closed";
type EventHandler = (msg: ServerToDashboardMessage) => void;
type StatusHandler = (status: WsStatus) => void;
type SocketFactory = (url: string) => WebSocket;

/** 기본 WS URL — env 우선, 없으면 현재 호스트 기준 추정. */
export function defaultWsUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/agent`;
  }
  return "ws://localhost:4000/ws/agent";
}

export class DashboardSocket {
  private ws: WebSocket | null = null;
  private status: WsStatus = "closed";
  private attempt = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly eventHandlers = new Set<EventHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();

  // 재연결 시 복원할 구독 상태.
  private subscribedWorkspace: string | null = null;
  private readonly subscribedConversations = new Set<string>();

  constructor(
    private readonly url: string = defaultWsUrl(),
    private readonly factory: SocketFactory = (u) => new WebSocket(u),
  ) {}

  getStatus(): WsStatus {
    return this.status;
  }

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  private setStatus(s: WsStatus): void {
    this.status = s;
    for (const h of this.statusHandlers) h(s);
  }

  private open(): void {
    if (this.ws) return;
    this.setStatus("connecting");
    const ws = this.factory(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus("open");
      // 구독 복원.
      if (this.subscribedWorkspace) {
        this.rawSend({
          type: "subscribe.workspace",
          payload: { workspaceId: this.subscribedWorkspace },
        });
      }
      for (const convId of this.subscribedConversations) {
        this.rawSend({ type: "subscribe.conversation", payload: { conversationId: convId } });
      }
    };

    ws.onmessage = (ev: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      const parsed = serverToDashboardMessageSchema.safeParse(data);
      if (!parsed.success) return; // 알 수 없는/미검증 type 무시(§5 전방 호환).
      for (const h of this.eventHandlers) h(parsed.data);
    };

    ws.onclose = () => {
      this.ws = null;
      this.setStatus("closed");
      if (!this.closedByUser) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose가 뒤따르므로 여기서는 소켓만 정리.
      try {
        ws.close();
      } catch {
        // noop
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = nextBackoff(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private rawSend(msg: DashboardToServerMessage): void {
    if (this.ws && this.status === "open") {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribeWorkspace(workspaceId: string): void {
    this.subscribedWorkspace = workspaceId;
    this.rawSend({ type: "subscribe.workspace", payload: { workspaceId } });
  }

  subscribeConversation(conversationId: string): void {
    this.subscribedConversations.add(conversationId);
    this.rawSend({ type: "subscribe.conversation", payload: { conversationId } });
  }

  unsubscribeConversation(conversationId: string): void {
    this.subscribedConversations.delete(conversationId);
    this.rawSend({ type: "unsubscribe.conversation", payload: { conversationId } });
  }

  setTyping(conversationId: string, isTyping: boolean): void {
    this.rawSend({ type: "typing.set", payload: { conversationId, isTyping } });
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // noop
      }
      this.ws = null;
    }
    this.setStatus("closed");
  }
}
