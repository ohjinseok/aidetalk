/**
 * 09_TESTING.md §2 — 메시징 신뢰성 필수 커버리지 5종.
 * 실제 Postgres + 서버(HTTP/WS)로 통합 검증한다.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encodeCursor } from "../lib/cursor";
import { sendVisitorMessage } from "../services/messaging";
import {
  createHarness,
  http,
  newConversation,
  newVisitorSession,
  WsClient,
  type Harness,
} from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** (createdAt,id) 오름차순 정렬 안정성 검증 헬퍼. */
function isSortedByKey(items: { createdAt: string; id: string }[]): boolean {
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1]!;
    const b = items[i]!;
    if (a.createdAt < b.createdAt) continue;
    if (a.createdAt === b.createdAt && a.id < b.id) continue;
    return false;
  }
  return true;
}

describe("09 §2-1 순서 보장", () => {
  it("동시 전송 20건 → listAfter가 (createdAt,id)로 안정 정렬되고 중복 없음", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const visitor = { visitorId: s.visitorId, workspaceId: s.workspaceId };

    // 20건 동시 전송(메시징 백본 = sendVisitorMessage).
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sendVisitorMessage(h.ctx, {
          visitor,
          conversationId: convId,
          clientMsgId: `c${i}`,
          text: `m${i}`,
        }),
      ),
    );

    const res1 = await http(h, "GET", `/v1/widget/conversations/${convId}/messages?limit=100`, {
      token: s.token,
    });
    expect(res1.status).toBe(200);
    const items1 = res1.json.items as { id: string; createdAt: string }[];
    expect(items1).toHaveLength(20);
    expect(new Set(items1.map((m) => m.id)).size).toBe(20);
    expect(isSortedByKey(items1)).toBe(true);

    // 재조회 시 동일 순서(안정성).
    const res2 = await http(h, "GET", `/v1/widget/conversations/${convId}/messages?limit=100`, {
      token: s.token,
    });
    expect((res2.json.items as { id: string }[]).map((m) => m.id)).toEqual(items1.map((m) => m.id));
  });
});

describe("09 §2-2 중복 제거", () => {
  it("동일 (conversationId, clientMsgId) 2회 → 메시지 1건, 두 번째는 동일 message", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const visitor = { visitorId: s.visitorId, workspaceId: s.workspaceId };

    const a = await sendVisitorMessage(h.ctx, {
      visitor,
      conversationId: convId,
      clientMsgId: "dup-1",
      text: "안녕",
    });
    const b = await sendVisitorMessage(h.ctx, {
      visitor,
      conversationId: convId,
      clientMsgId: "dup-1",
      text: "안녕(재전송)",
    });
    expect(b.id).toBe(a.id);

    const res = await http(h, "GET", `/v1/widget/conversations/${convId}/messages`, {
      token: s.token,
    });
    expect(res.json.items).toHaveLength(1);
    expect(res.json.items[0].content.text).toBe("안녕"); // 최초 저장 유지
  });
});

describe("09 §2-3 재연결 동기화", () => {
  it("WS 끊김 중 서버측 3건 → after cursor 동기화로 정확히 3건, 중복 0", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);

    // WS 연결 후 손님 메시지 1건 → baseline.
    const ws = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${s.token}`);
    ws.send("message.send", { conversationId: convId, clientMsgId: "base", text: "시작" });
    const ack = await ws.nextType("message.ack");
    const baseline = ack.payload.message as { id: string; createdAt: string };
    const cursor = encodeCursor(baseline);

    // 끊김.
    ws.close();

    // 서버측 3건 발생(상담원/AI 메시지 시뮬레이션).
    for (let i = 0; i < 3; i++) {
      await h.ctx.repos.message.append(s.workspaceId, convId, {
        role: "agent_ai",
        authorId: "agt_test",
        content: { type: "text", text: `server-${i}` },
      });
    }

    // 재연결 후 after cursor로 동기화.
    const ws2 = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${s.token}`);
    const res = await http(
      h,
      "GET",
      `/v1/widget/conversations/${convId}/messages?after=${cursor}`,
      { token: s.token },
    );
    const items = res.json.items as { id: string }[];
    expect(items).toHaveLength(3);
    expect(new Set(items.map((m) => m.id)).size).toBe(3);
    expect(items.some((m) => m.id === baseline.id)).toBe(false);
    ws2.close();
  });
});

describe("09 §2-4 미ACK 재전송", () => {
  it("ack 유실 후 동일 clientMsgId 재전송 → 최종 메시지 1건", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const ws = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${s.token}`);

    ws.send("message.send", { conversationId: convId, clientMsgId: "resend-1", text: "hi" });
    const ack1 = await ws.nextType("message.ack");
    // ack 유실 가정 → 클라이언트가 동일 clientMsgId로 재전송.
    ws.send("message.send", { conversationId: convId, clientMsgId: "resend-1", text: "hi" });
    const ack2 = await ws.nextType("message.ack");
    expect(ack2.payload.message.id).toBe(ack1.payload.message.id);

    const res = await http(h, "GET", `/v1/widget/conversations/${convId}/messages`, {
      token: s.token,
    });
    expect(res.json.items).toHaveLength(1);
    ws.close();
  });
});

describe("09 §2-5 long-poll 폴백 경로", () => {
  it("순서(8건 동시)와 중복 제거가 long-poll에서도 동일", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);

    // 순서: 8건 동시 long-poll 전송(레이트리밋 10/min 이내).
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        http(h, "POST", `/v1/widget/conversations/${convId}/messages`, {
          token: s.token,
          body: { clientMsgId: `lp${i}`, text: `lp-${i}` },
        }),
      ),
    );
    const res = await http(h, "GET", `/v1/widget/conversations/${convId}/messages?limit=100`, {
      token: s.token,
    });
    const items = res.json.items as { id: string; createdAt: string }[];
    expect(items).toHaveLength(8);
    expect(isSortedByKey(items)).toBe(true);

    // 중복 제거: 동일 clientMsgId 2회.
    const d1 = await http(h, "POST", `/v1/widget/conversations/${convId}/messages`, {
      token: s.token,
      body: { clientMsgId: "lp-dup", text: "d" },
    });
    const d2 = await http(h, "POST", `/v1/widget/conversations/${convId}/messages`, {
      token: s.token,
      body: { clientMsgId: "lp-dup", text: "d-again" },
    });
    expect(d1.status).toBe(201);
    expect(d2.status).toBe(201);
    expect(d2.json.message.id).toBe(d1.json.message.id);

    const after = await http(h, "GET", `/v1/widget/conversations/${convId}/messages?limit=100`, {
      token: s.token,
    });
    expect(after.json.items).toHaveLength(9); // 8 + 중복 1건
  });
});
