/**
 * WS 연결 관리 — 06_WIDGET_SPEC.md §4.2 (테스트 필수 영역).
 *
 * - 지수 백오프 재연결(backoff.ts).
 * - 최초 연결이 10초 내 3회 실패 → long-poll 폴백 모드로 전환.
 * - 폴백 중에도 60초마다 WS 재시도, 성공 시 복귀.
 * - visibilitychange(visible) 시 즉시 재연결 시도.
 *
 * WS/타이머/시계를 주입 가능하게 해 단위 테스트에서 결정론적으로 검증한다.
 */
import { serverToWidgetMessageSchema, type ServerToWidgetMessage } from "../shared";
import type { ConnectionStatus } from "../types";
import { computeBackoff } from "./backoff";

/** 테스트/런타임 공통 최소 소켓 인터페이스. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export type ConnectionMode = "ws" | "polling";

export interface ConnectionDeps {
  socketFactory: (url: string) => SocketLike;
  now: () => number;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  rng?: () => number;
}

export interface ConnectionCallbacks {
  onMessage: (msg: ServerToWidgetMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
  onMode: (mode: ConnectionMode) => void;
  /** WS가 (재)연결되어 online이 된 순간 — 큐 재전송 + 누락 동기화 트리거. */
  onOnline: () => void;
}

/** §4.2 폴백 판정 임계값. */
export const INITIAL_FAIL_WINDOW_MS = 10000;
export const INITIAL_FAIL_THRESHOLD = 3;
export const FALLBACK_RETRY_MS = 60000;

export class ConnectionManager {
  private mode: ConnectionMode = "ws";
  private status: ConnectionStatus = "idle";
  private socket: SocketLike | null = null;
  private reconnectAttempt = 0;
  private everConnected = false;
  private initialFailures: number[] = [];
  private timer: unknown = null;
  private stopped = false;

  constructor(
    private url: string,
    private deps: ConnectionDeps,
    private cb: ConnectionCallbacks,
  ) {}

  getMode(): ConnectionMode {
    return this.mode;
  }
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** 연결 시작. */
  start(): void {
    this.stopped = false;
    this.openSocket();
  }

  /** 완전 종료 — 언마운트/정리 시. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.closeSocket();
    this.setStatus("offline");
  }

  /** WS로 봉투 전송. 전송했으면 true(폴백/미연결이면 false → 호출부가 REST 폴백). */
  send(envelope: unknown): boolean {
    if (this.mode === "ws" && this.status === "online" && this.socket) {
      try {
        this.socket.send(JSON.stringify(envelope));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** visibilitychange(visible) 복귀 시 즉시 재연결/재시도. */
  onVisible(): void {
    if (this.stopped) return;
    if (this.status === "online") return;
    this.clearTimer();
    this.openSocket();
  }

  private openSocket(): void {
    if (this.stopped) return;
    this.closeSocket();
    this.setStatus(this.everConnected ? "reconnecting" : "connecting");

    let socket: SocketLike;
    try {
      socket = this.deps.socketFactory(this.url);
    } catch {
      this.handleFailure();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.stopped) return;
      this.reconnectAttempt = 0;
      this.everConnected = true;
      this.initialFailures = [];
      this.mode = "ws";
      this.cb.onMode("ws");
      this.setStatus("online");
      this.cb.onOnline();
    };

    socket.onmessage = (ev) => {
      this.handleRaw(ev.data);
    };

    socket.onclose = () => {
      if (this.stopped) return;
      if (this.status === "online") {
        // 정상 연결 후 끊김 → 재연결 백오프.
        this.setStatus("reconnecting");
        this.scheduleReconnect();
      } else {
        this.handleFailure();
      }
    };

    socket.onerror = () => {
      // onclose가 뒤따르므로 여기서는 소켓만 정리. 상태 전이는 onclose에서.
    };
  }

  private handleRaw(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    // 알 수 없는 type은 safeParse 실패 → 무시(전방 호환, §5).
    const result = serverToWidgetMessageSchema.safeParse(parsed);
    if (result.success) this.cb.onMessage(result.data);
  }

  /** 최초 연결 실패 처리 — 10초 내 3회면 폴백, 아니면 백오프 재시도. */
  private handleFailure(): void {
    this.closeSocket();
    const now = this.deps.now();
    this.initialFailures.push(now);
    this.initialFailures = this.initialFailures.filter(
      (t) => now - t <= INITIAL_FAIL_WINDOW_MS,
    );

    if (!this.everConnected && this.initialFailures.length >= INITIAL_FAIL_THRESHOLD) {
      this.enterFallback();
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearTimer();
    const delay = computeBackoff(this.reconnectAttempt, this.deps.rng);
    this.reconnectAttempt += 1;
    this.timer = this.deps.schedule(() => this.openSocket(), delay);
  }

  private enterFallback(): void {
    this.mode = "polling";
    this.cb.onMode("polling");
    this.setStatus("polling");
    this.clearTimer();
    // 폴백 중에도 60초마다 WS 재시도.
    this.timer = this.deps.schedule(() => {
      this.reconnectAttempt = 0;
      this.openSocket();
    }, FALLBACK_RETRY_MS);
  }

  private closeSocket(): void {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }

  private clearTimer(): void {
    if (this.timer != null) {
      this.deps.cancel(this.timer);
      this.timer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.cb.onStatus(status);
  }
}
