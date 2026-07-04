import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConnectionManager,
  type ConnectionCallbacks,
  type ConnectionDeps,
  type ConnectionMode,
  type SocketLike,
} from "../app/lib/connection";
import type { ServerToWidgetMessage } from "../app/shared";

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  fireOpen() {
    this.onopen?.();
  }
  fireClose() {
    this.onclose?.();
  }
  fireMessage(data: unknown) {
    this.onmessage?.({ data });
  }
}

interface Harness {
  mgr: ConnectionManager;
  sockets: FakeSocket[];
  socket: (i: number) => FakeSocket;
  flushNext: () => void;
  pendingCount: () => number;
  setNow: (n: number) => void;
  modes: ConnectionMode[];
  messages: ServerToWidgetMessage[];
  onlineCount: () => number;
}

function makeHarness(): Harness {
  const sockets: FakeSocket[] = [];
  let now = 0;
  const timers: { fn: () => void }[] = [];
  let online = 0;
  const modes: ConnectionMode[] = [];
  const messages: ServerToWidgetMessage[] = [];

  const deps: ConnectionDeps = {
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    now: () => now,
    schedule: (fn) => {
      const handle = { fn };
      timers.push(handle);
      return handle;
    },
    cancel: (h) => {
      const idx = timers.indexOf(h as { fn: () => void });
      if (idx >= 0) timers.splice(idx, 1);
    },
    rng: () => 0.5,
  };
  const cb: ConnectionCallbacks = {
    onMessage: (m) => messages.push(m),
    onStatus: () => {},
    onMode: (m) => modes.push(m),
    onOnline: () => {
      online += 1;
    },
  };
  const mgr = new ConnectionManager("wss://x/ws", deps, cb);
  return {
    mgr,
    sockets,
    socket: (i: number) => {
      const s = sockets[i];
      if (!s) throw new Error(`socket ${i} 없음`);
      return s;
    },
    flushNext: () => {
      const t = timers.shift();
      t?.fn();
    },
    pendingCount: () => timers.length,
    setNow: (n) => {
      now = n;
    },
    modes,
    messages,
    onlineCount: () => online,
  };
}

describe("app/lib/connection — 폴백/재연결 (06 §4.2)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("최초 연결이 10초 내 3회 실패하면 long-poll 폴백으로 전환", () => {
    const h = makeHarness();
    h.mgr.start();
    // 1차 실패
    h.socket(0).fireClose();
    expect(h.mgr.getMode()).toBe("ws");
    h.flushNext(); // 백오프 후 재연결 → socket[1]
    // 2차 실패
    h.socket(1).fireClose();
    expect(h.mgr.getMode()).toBe("ws");
    h.flushNext(); // → socket[2]
    // 3차 실패 → 폴백
    h.socket(2).fireClose();
    expect(h.mgr.getMode()).toBe("polling");
    expect(h.modes).toContain("polling");
  });

  it("실패가 10초 창을 벗어나면 폴백하지 않는다", () => {
    const h = makeHarness();
    h.mgr.start();
    h.setNow(0);
    h.socket(0).fireClose(); // t=0
    h.flushNext();
    h.setNow(11000); // 첫 실패 만료
    h.socket(1).fireClose(); // t=11000 → 창 내 1건
    h.flushNext();
    h.socket(2).fireClose(); // t=11000 → 창 내 2건
    expect(h.mgr.getMode()).toBe("ws");
  });

  it("연결 성공 후 끊기면 폴백이 아니라 백오프 재연결", () => {
    const h = makeHarness();
    h.mgr.start();
    h.socket(0).fireOpen();
    expect(h.mgr.getStatus()).toBe("online");
    expect(h.onlineCount()).toBe(1);
    // 여러 번 끊겨도 everConnected=true라 폴백 안 됨
    h.socket(0).fireClose();
    h.flushNext();
    h.socket(1).fireClose();
    h.flushNext();
    h.socket(2).fireClose();
    expect(h.mgr.getMode()).toBe("ws");
    expect(h.mgr.getStatus()).toBe("reconnecting");
  });

  it("onVisible은 즉시 재연결을 시도한다", () => {
    const h = makeHarness();
    h.mgr.start();
    h.socket(0).fireClose(); // 재연결 타이머 예약됨
    const before = h.sockets.length;
    h.mgr.onVisible(); // 타이머 기다리지 않고 즉시 새 소켓
    expect(h.sockets.length).toBe(before + 1);
  });

  it("폴백 진입 후 online이 되면 ws 모드로 복귀", () => {
    const h = makeHarness();
    h.mgr.start();
    h.socket(0).fireClose();
    h.flushNext();
    h.socket(1).fireClose();
    h.flushNext();
    h.socket(2).fireClose();
    expect(h.mgr.getMode()).toBe("polling");
    // 폴백 60초 재시도 타이머 flush → 새 소켓 → open
    h.flushNext();
    const last = h.socket(h.sockets.length - 1);
    last.fireOpen();
    expect(h.mgr.getMode()).toBe("ws");
    expect(h.mgr.getStatus()).toBe("online");
  });

  it("알 수 없는 type은 무시하고 유효한 message.new만 전달", () => {
    const h = makeHarness();
    h.mgr.start();
    h.socket(0).fireOpen();
    h.socket(0).fireMessage(JSON.stringify({ type: "unknown.thing", payload: {} }));
    h.socket(0).fireMessage("not json");
    h.socket(0).fireMessage(
      JSON.stringify({
        type: "message.new",
        payload: {
          message: {
            id: "msg_1",
            conversationId: "conv_1",
            role: "agent_ai",
            authorId: "agt_1",
            content: { type: "text", text: "hi" },
            createdAt: "2026-07-03T00:00:00.000Z",
          },
        },
      }),
    );
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]?.type).toBe("message.new");
  });

  it("online 상태에서 send는 WS로 전송, 폴백/미연결이면 false", () => {
    const h = makeHarness();
    h.mgr.start();
    expect(h.mgr.send({ type: "x" })).toBe(false); // 아직 connecting
    h.socket(0).fireOpen();
    expect(h.mgr.send({ type: "message.send" })).toBe(true);
    expect(h.socket(0).sent).toHaveLength(1);
  });
});
