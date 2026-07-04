import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardSocket, nextBackoff } from "../ws/client";

/** 최소 기능의 가짜 WebSocket — 팩토리로 주입해 재연결/구독 복원을 검증한다. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
  triggerOpen() {
    this.onopen?.();
  }
  triggerMessage(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function makeSocket() {
  return new DashboardSocket("ws://test/ws/agent", (u) => new FakeWebSocket(u) as unknown as WebSocket);
}

describe("nextBackoff", () => {
  it("지수 증가 후 상한", () => {
    expect(nextBackoff(0)).toBe(1000);
    expect(nextBackoff(1)).toBe(2000);
    expect(nextBackoff(2)).toBe(4000);
    expect(nextBackoff(20)).toBe(30_000);
  });
});

describe("DashboardSocket", () => {
  it("open 시 구독 상태를 복원 전송한다", () => {
    const s = makeSocket();
    s.connect();
    s.subscribeWorkspace("ws_1");
    s.subscribeConversation("conv_1");
    const ws = FakeWebSocket.instances[0]!;
    // open 전엔 전송 안 됨(soket status connecting)
    expect(ws.sent).toHaveLength(0);
    ws.triggerOpen();
    const types = ws.sent.map((s) => JSON.parse(s).type);
    expect(types).toContain("subscribe.workspace");
    expect(types).toContain("subscribe.conversation");
  });

  it("비정상 close 후 백오프로 재연결하고 구독을 복원한다", () => {
    const s = makeSocket();
    s.connect();
    s.subscribeWorkspace("ws_1");
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.triggerOpen();
    ws1.sent = [];
    // 서버가 끊음
    ws1.onclose?.();
    // 1초 백오프 후 새 소켓
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const ws2 = FakeWebSocket.instances[1]!;
    ws2.triggerOpen();
    const types = ws2.sent.map((s) => JSON.parse(s).type);
    expect(types).toContain("subscribe.workspace");
  });

  it("close(user)는 재연결하지 않는다", () => {
    const s = makeSocket();
    s.connect();
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.triggerOpen();
    s.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("알 수 없는 이벤트 type은 무시한다", () => {
    const s = makeSocket();
    const received: string[] = [];
    s.onEvent((m) => received.push(m.type));
    s.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.triggerOpen();
    ws.triggerMessage({ type: "unknown.event", payload: {} });
    ws.triggerMessage({
      type: "conversation.updated",
      payload: {
        conversation: {
          id: "conv_1",
          workspaceId: "ws_1",
          visitorId: "vis_1",
          status: "open",
          mode: "ai",
          assigneeId: null,
          lastMessageAt: null,
          metadata: {},
          createdAt: "2026-07-03T00:00:00Z",
        },
      },
    });
    expect(received).toEqual(["conversation.updated"]);
  });
});
