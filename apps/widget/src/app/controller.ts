/**
 * WidgetController — 06_WIDGET_SPEC.md §3(상태 머신)·§4(연결/신뢰성) 통합.
 *
 * 프레임워크 밖에서 모든 상태/부수효과를 관리하고, 스냅샷 구독으로 Preact에 전달한다.
 * 순수 로직(파이프라인/백오프/폴백/트래킹)은 lib/*에 분리해 단위 테스트하고,
 * 여기서는 그것들을 조립한다.
 */
import * as api from "./lib/api";
import { ApiError } from "./lib/api";
import {
  ConnectionManager,
  type ConnectionMode,
  type SocketLike,
} from "./lib/connection";
import { newClientMsgId } from "./lib/ids";
import { MessageStore } from "./lib/messageStore";
import { readReceiptMsgId } from "./lib/readReceipt";
import type {
  ConnectionStatus,
  DisplayItem,
  TypingState,
  WidgetConfig,
  WidgetPhase,
  WidgetSettings,
} from "./types";
import type { ServerToWidgetMessage, Visitor } from "./shared";

const ACK_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 2000;

/** 렌더용 불변 스냅샷 — 컴포넌트는 이것만 본다. */
export interface WidgetSnapshot {
  phase: WidgetPhase;
  open: boolean;
  settings: WidgetSettings | null;
  workspaceName: string | null;
  primaryColor: string;
  visitor: Visitor | null;
  conversationId: string | null;
  items: DisplayItem[];
  localSystemLines: string[];
  quickReplies: string[];
  connection: ConnectionStatus;
  mode: ConnectionMode;
  typing: TypingState;
  unread: number;
  emailPromptVisible: boolean;
  /** 이 손님 메시지 id 밑에 "읽음"을 표시(상담원이 읽은 경우). 없으면 null. */
  readReceiptMsgId: string | null;
  error: string | null;
}

const DEFAULT_PRIMARY = "#4F46E5";

export class WidgetController {
  private phase: WidgetPhase = "idle";
  private open = false;
  private settings: WidgetSettings | null = null;
  private workspaceName: string | null = null;
  private visitor: Visitor | null = null;
  private token: string | null = null;
  private conversationId: string | null = null;
  private connection: ConnectionStatus = "idle";
  private mode: ConnectionMode = "ws";
  private typing: TypingState = { ai: false, human: false };
  private unread = 0;
  /** 상담원이 읽음 처리한 마지막 메시지 id(read.update by="agent")로 갱신. */
  private agentLastReadMessageId: string | null = null;
  private emailPromptVisible = false;
  private emailPromptShown = false;
  private emailCaptured = false;
  private error: string | null = null;
  private localSystemLines: string[] = [];
  private firstMessageSent = false;
  /** 진행 중인 boot(세션 발급) — 전송이 부팅보다 앞서면 이걸 기다려 토큰 준비를 보장. */
  private bootPromise: Promise<void> | null = null;

  private store = new MessageStore();
  private conn: ConnectionManager | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private polling = false;

  private listeners = new Set<() => void>();
  private snapshot: WidgetSnapshot;

  constructor(private config: WidgetConfig) {
    this.snapshot = this.buildSnapshot();
  }

  // ---------- 구독 ----------
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  getSnapshot(): WidgetSnapshot {
    return this.snapshot;
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) fn();
  }

  private buildSnapshot(): WidgetSnapshot {
    const last = this.store.lastConfirmed();
    const quickReplies =
      last && last.role !== "visitor" ? (last.content.quickReplies ?? []) : [];
    const primaryColor =
      (typeof this.settings?.primaryColor === "string" && this.settings.primaryColor) ||
      DEFAULT_PRIMARY;
    const workspaceName = this.workspaceName;
    return {
      phase: this.phase,
      open: this.open,
      settings: this.settings,
      workspaceName,
      primaryColor,
      visitor: this.visitor,
      conversationId: this.conversationId,
      items: this.store.displayItems(),
      localSystemLines: this.conversationId ? [] : this.localSystemLines,
      quickReplies,
      connection: this.connection,
      mode: this.mode,
      typing: this.typing,
      unread: this.unread,
      emailPromptVisible: this.emailPromptVisible,
      readReceiptMsgId: this.computeReadReceiptMsgId(),
      error: this.error,
    };
  }

  /** "읽음" 표시 대상 손님 메시지 id(순수 로직은 lib/readReceipt). */
  private computeReadReceiptMsgId(): string | null {
    return readReceiptMsgId(this.store.confirmedList(), this.agentLastReadMessageId);
  }

  // ---------- 상태 머신 §3 ----------
  toggle(): void {
    if (this.open) this.close();
    else this.openWidget();
  }

  openWidget(): void {
    this.open = true;
    this.unread = 0;
    this.persistOpen(true);
    if (this.phase === "idle") {
      this.bootPromise = this.boot();
    } else {
      this.markReadIfPossible();
    }
    this.emit();
  }

  close(): void {
    this.open = false;
    this.persistOpen(false);
    this.emit();
  }

  /** [Boot] POST /v1/widget/session → 설정/토큰/열린 대화 로드. */
  private async boot(): Promise<void> {
    this.phase = "booting";
    this.emit();
    try {
      const existingToken = this.readToken() ?? undefined;
      const session = await api.postSession(this.config.serverUrl, {
        workspaceId: this.config.workspaceId,
        existingToken,
        pageUrl: location.href,
        referrer: document.referrer || undefined,
      });
      this.token = session.visitorToken;
      this.writeToken(session.visitorToken);
      this.visitor = session.visitor;
      this.workspaceName = session.workspaceName;
      this.settings = session.widgetSettings;
      this.emailCaptured = Boolean(session.visitor.email);

      // 인사말/운영시간 외 안내는 대화 생성 전까지 로컬 표시(§3).
      this.localSystemLines = [];
      const greeting = this.settings.greeting;
      if (typeof greeting === "string" && greeting.length > 0) this.localSystemLines.push(greeting);
      if (this.settings.isOfficeHours === false) {
        const off = this.settings.offHoursMessage;
        if (typeof off === "string" && off.length > 0) this.localSystemLines.push(off);
      }

      this.startConnection();

      if (session.openConversationId) {
        this.conversationId = session.openConversationId;
        // 기존 열린 대화 복원 — 새 메시지를 보내지 않아도 상대 메시지를 실시간 수신해야 한다.
        this.subscribeConversation();
        await this.syncMessages();
        // 열린 채로 기존 대화를 복원했으면 즉시 읽음 처리(대화 열림 시 read.mark).
        this.markReadIfPossible();
      }
      this.phase = "ready";
      this.emit();
    } catch {
      this.phase = "error";
      this.error = "boot_failed";
      this.emit();
    }
  }

  // ---------- 연결 §4.2 ----------
  private startConnection(): void {
    if (this.conn || !this.token) return;
    const url = this.wsUrl(this.token);
    this.conn = new ConnectionManager(
      url,
      {
        socketFactory: (u) => new WebSocket(u) as unknown as SocketLike,
        now: () => Date.now(),
        schedule: (fn, ms) => setTimeout(fn, ms),
        cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
      {
        onMessage: (m) => this.onServerMessage(m),
        onStatus: (s) => {
          this.connection = s;
          this.emit();
        },
        onMode: (mode) => this.onModeChange(mode),
        onOnline: () => void this.onReconnected(),
      },
    );
    this.conn.start();
  }

  private onModeChange(mode: ConnectionMode): void {
    this.mode = mode;
    if (mode === "polling") this.startPolling();
    else this.stopPolling();
    this.emit();
  }

  /** 재연결(online) 시 — 대화 구독 + 누락 동기화 + 큐 재전송(§4.1). */
  private async onReconnected(): Promise<void> {
    this.stopPolling();
    // 구독을 먼저 걸어 이후 도착하는 상대 메시지를 놓치지 않게 한다(sync가 그 이전분을 덮는다).
    this.subscribeConversation();
    await this.syncMessages();
    this.resendPending();
  }

  /**
   * 손님 소켓을 현재 대화의 conv:all 채널에 명시 구독시킨다(WS online일 때만 유효).
   * message.send만으로도 서버가 암묵 구독하지만, 기존 대화 복원/REST 우선 전송 시 누락을 막는다.
   */
  private subscribeConversation(): void {
    if (!this.conversationId) return;
    this.conn?.send({
      type: "conversation.subscribe",
      payload: { conversationId: this.conversationId },
    });
  }

  // ---------- 전송 파이프라인 §4.1 ----------
  async sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.phase === "idle") return;

    // 부팅(세션 발급)이 아직 진행 중이면 완료를 기다린다 — 토큰 준비 전 전송으로 인한 401 방지.
    if (this.bootPromise) {
      try {
        await this.bootPromise;
      } catch {
        /* boot 실패는 아래 token 체크에서 걸러진다 */
      }
    }
    if (!this.token) return; // 부팅 실패 등으로 세션이 없으면 전송 불가.

    // 대화 없으면 첫 전송 시점에 생성(§3).
    if (!this.conversationId) {
      try {
        const created = await api.postConversation(
          this.config.serverUrl,
          this.token!,
          location.href,
        );
        this.conversationId = created.conversation.id;
        this.localSystemLines = [];
        // 대화 생성 직후 구독 — 첫 메시지가 REST로 나가도 AI 응답을 실시간 수신.
        this.subscribeConversation();
        // 서버가 인사말을 system 메시지로 삽입 → 초기 동기화.
        await this.syncMessages();
      } catch (e) {
        this.error = e instanceof ApiError ? e.code : "conversation_failed";
        this.emit();
        return;
      }
    }

    const clientMsgId = newClientMsgId();
    this.store.addPending(clientMsgId, trimmed);
    this.dispatchSend(clientMsgId, trimmed);

    if (!this.firstMessageSent) {
      this.firstMessageSent = true;
      this.maybeShowEmailPrompt();
    }
    this.emit();
  }

  /**
   * WS 전송 시도. ack 타임아웃 예약.
   * WS로 못 보냈을 때 REST는 **폴백(polling) 모드에서만** 쓴다(§4.2).
   * WS가 아직 연결 중/재연결 중이면 REST로 조급하게 보내지 않고 pending으로 둔다 —
   * 그래야 서버가 message.send 시점에 conv:all을 구독한 뒤 dispatch해 AI 응답을 놓치지 않는다.
   * pending은 onReconnected(resendPending) 또는 ack 타임아웃 재전송으로 WS 연결 후 flush된다.
   */
  private dispatchSend(clientMsgId: string, text: string): void {
    if (!this.conversationId) return;
    const envelope = {
      type: "message.send" as const,
      payload: { conversationId: this.conversationId, clientMsgId, text },
    };
    const sentViaWs = this.conn?.send(envelope) ?? false;
    if (!sentViaWs && this.mode === "polling") {
      void this.sendViaRest(clientMsgId, text);
    }
    this.armAckTimeout(clientMsgId, text);
  }

  private async sendViaRest(clientMsgId: string, text: string): Promise<void> {
    if (!this.conversationId || !this.token) return;
    try {
      const message = await api.postMessage(
        this.config.serverUrl,
        this.token,
        this.conversationId,
        clientMsgId,
        text,
      );
      // REST 응답을 ack와 동일 처리.
      this.store.ack(clientMsgId, message);
      this.clearAckTimer(clientMsgId);
      this.emit();
    } catch (e) {
      this.store.markFailed(clientMsgId);
      if (e instanceof ApiError && e.code === "rate/limited") this.error = "rate/limited";
      this.emit();
    }
  }

  /** 5초 내 ack 없으면 같은 clientMsgId로 재전송(§4.1). */
  private armAckTimeout(clientMsgId: string, text: string): void {
    this.clearAckTimer(clientMsgId);
    const timer = setTimeout(() => {
      if (this.store.hasPending(clientMsgId)) {
        this.dispatchSend(clientMsgId, text);
      }
    }, ACK_TIMEOUT_MS);
    this.ackTimers.set(clientMsgId, timer);
  }

  private clearAckTimer(clientMsgId: string): void {
    const t = this.ackTimers.get(clientMsgId);
    if (t) {
      clearTimeout(t);
      this.ackTimers.delete(clientMsgId);
    }
  }

  private resendPending(): void {
    for (const { clientMsgId, text } of this.store.pendingIds()) {
      this.store.addPending(clientMsgId, text); // 상태 pending 복구
      this.dispatchSend(clientMsgId, text);
    }
    this.emit();
  }

  /** 실패한 pending 수동 재시도. */
  retry(clientMsgId: string): void {
    for (const { clientMsgId: id, text } of this.store.pendingIds()) {
      if (id === clientMsgId) {
        this.store.addPending(id, text);
        this.dispatchSend(id, text);
        this.emit();
        return;
      }
    }
  }

  // ---------- 수신 §5.2 ----------
  private onServerMessage(msg: ServerToWidgetMessage): void {
    switch (msg.type) {
      case "message.ack": {
        this.store.ack(msg.payload.clientMsgId, msg.payload.message);
        this.clearAckTimer(msg.payload.clientMsgId);
        break;
      }
      case "message.new": {
        this.store.upsert(msg.payload.message);
        if (msg.payload.message.role !== "visitor") {
          if (!this.open) this.unread += 1;
          else this.markReadIfPossible();
        }
        break;
      }
      case "typing.start":
        this.typing = { ...this.typing, [msg.payload.by]: true };
        break;
      case "typing.stop":
        this.typing = { ...this.typing, [msg.payload.by]: false };
        break;
      case "conversation.updated":
        // mode/status 변경 반영(현재는 상태 표시만).
        break;
      case "read.update":
        // 상담원이 읽음 처리 → 내 마지막 메시지에 "읽음" 표시(by="visitor"는 내 자신 → 무시).
        if (msg.payload.by === "agent") {
          this.agentLastReadMessageId = msg.payload.lastMessageId;
        }
        break;
      case "error":
        this.error = msg.payload.code;
        break;
    }
    this.emit();
  }

  // ---------- 동기화 / 폴백 폴링 §4.1-4.2 ----------
  private async syncMessages(): Promise<void> {
    if (!this.conversationId || !this.token) return;
    try {
      const after = this.store.lastConfirmedCursor();
      const list = await api.getMessages(
        this.config.serverUrl,
        this.token,
        this.conversationId,
        after,
      );
      this.store.upsertMany(list.items);
      this.emit();
    } catch {
      /* 동기화 실패는 다음 기회에 재시도 */
    }
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    const loop = async () => {
      if (!this.polling) return;
      await this.syncMessages();
      this.markReadIfPossible();
      if (this.polling) this.pollTimer = setTimeout(loop, POLL_INTERVAL_MS);
    };
    this.pollTimer = setTimeout(loop, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ---------- 이메일 프롬프트 §2 ----------
  private maybeShowEmailPrompt(): void {
    if (this.emailPromptShown || this.emailCaptured) return;
    if (this.visitor?.email) return;
    this.emailPromptShown = true;
    this.emailPromptVisible = true;
  }

  async submitEmail(email: string): Promise<void> {
    const value = email.trim();
    this.emailPromptVisible = false;
    this.emit();
    if (!value || !this.token) return;
    try {
      const res = await api.patchProfile(this.config.serverUrl, this.token, { email: value });
      this.token = res.visitorToken;
      this.writeToken(res.visitorToken);
      this.visitor = res.visitor;
      this.emailCaptured = true;
      this.emit();
    } catch {
      /* 프로필 저장 실패는 조용히 무시 — 대화 흐름 방해 금지 */
    }
  }

  skipEmail(): void {
    this.emailPromptVisible = false;
    this.emit();
  }

  // ---------- 핸드오프 §2 ----------
  async requestHandoff(): Promise<void> {
    if (!this.conversationId || !this.token) return;
    try {
      await api.postHandoff(this.config.serverUrl, this.token, this.conversationId);
    } catch {
      /* 무시 — conversation.updated로 반영됨 */
    }
  }

  /** QuickReply 버튼 클릭 → 그 텍스트로 전송(§2). */
  sendQuickReply(text: string): void {
    void this.sendText(text);
  }

  dismissError(): void {
    this.error = null;
    this.emit();
  }

  // ---------- 읽음/생명주기 ----------
  private markReadIfPossible(): void {
    if (!this.open || !this.conversationId) return;
    const last = this.store.lastConfirmed();
    if (!last) return;
    this.conn?.send({
      type: "read.mark",
      payload: { conversationId: this.conversationId, lastMessageId: last.id },
    });
  }

  /** visibilitychange(visible) — 즉시 재연결(§4.2). */
  handleVisible(): void {
    this.conn?.onVisible();
  }

  destroy(): void {
    this.conn?.stop();
    this.stopPolling();
    for (const t of this.ackTimers.values()) clearTimeout(t);
    this.ackTimers.clear();
    this.listeners.clear();
  }

  // ---------- 저장소 ----------
  private tokenKey(): string {
    return `od_vt_${this.config.workspaceId}`;
  }
  private openKey(): string {
    return `od_open_${this.config.workspaceId}`;
  }
  private readToken(): string | null {
    try {
      return localStorage.getItem(this.tokenKey());
    } catch {
      return null;
    }
  }
  private writeToken(token: string): void {
    try {
      localStorage.setItem(this.tokenKey(), token);
    } catch {
      /* private 모드 등 — 무시 */
    }
  }
  private persistOpen(open: boolean): void {
    try {
      sessionStorage.setItem(this.openKey(), open ? "1" : "0");
    } catch {
      /* 무시 */
    }
  }
  wasOpen(): boolean {
    try {
      return sessionStorage.getItem(this.openKey()) === "1";
    } catch {
      return false;
    }
  }

  private wsUrl(token: string): string {
    const base = this.config.serverUrl.replace(/^http/, "ws");
    return `${base}/ws/visitor?token=${encodeURIComponent(token)}`;
  }
}
