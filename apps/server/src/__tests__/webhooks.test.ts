/**
 * 웹훅(Should) — 04_API_SPEC.md §2 웹훅 섹션 / 08_SECURITY.md §7.
 * CRUD 권한, HMAC 서명, 이벤트 구독 필터링, 재시도 스케줄을 검증한다.
 */
import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createHarness,
  drainDispatch,
  drainWebhooks,
  http,
  newConversation,
  newUserWithWorkspace,
  newVisitorSession,
  registerMockAgent,
  registerMockWebhook,
  type Harness,
} from "../../test/harness";
import { startMockAgent, type MockAgent } from "../../test/mock-agent";
import { HttpWebhookDispatcher } from "../services/webhook-dispatcher";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let h: Harness;
let receiver: MockAgent;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  receiver = await startMockAgent();
});
afterEach(async () => {
  await receiver.close();
});

// ---------- CRUD ----------
describe("웹훅 CRUD", () => {
  it("등록·목록·삭제 — secret은 등록 응답 1회만 노출", async () => {
    const u = await newUserWithWorkspace(h);

    const created = await http(h, "POST", `/v1/workspaces/${u.workspaceId}/webhooks`, {
      cookie: u.cookie,
      body: { url: receiver.url, events: ["agent.auto_disabled"] },
    });
    expect(created.status).toBe(201);
    expect(created.json.secret).toMatch(/^whsec_/);
    expect(created.json.webhook.url).toBe(receiver.url);
    expect(created.json.webhook.events).toEqual(["agent.auto_disabled"]);
    expect(created.json.webhook.secretHash).toBeUndefined();
    expect(created.json.webhook.secretEnc).toBeUndefined();

    const list = await http(h, "GET", `/v1/workspaces/${u.workspaceId}/webhooks`, {
      cookie: u.cookie,
    });
    expect(list.status).toBe(200);
    expect(list.json.items).toHaveLength(1);
    expect(list.json.items[0].secretHash).toBeUndefined();

    const del = await http(
      h,
      "DELETE",
      `/v1/workspaces/${u.workspaceId}/webhooks/${created.json.webhook.id}`,
      { cookie: u.cookie },
    );
    expect(del.status).toBe(204);

    const listAfter = await http(h, "GET", `/v1/workspaces/${u.workspaceId}/webhooks`, {
      cookie: u.cookie,
    });
    expect(listAfter.json.items).toHaveLength(0);
  });

  it("허용되지 않은 이벤트명 → validation/failed", async () => {
    const u = await newUserWithWorkspace(h);
    const res = await http(h, "POST", `/v1/workspaces/${u.workspaceId}/webhooks`, {
      cookie: u.cookie,
      body: { url: receiver.url, events: ["not_a_real_event"] },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation/failed");
  });

  it("타 워크스페이스 멤버 접근 → 403(생성/목록/삭제 전부)", async () => {
    const owner = await newUserWithWorkspace(h);
    const other = await newUserWithWorkspace(h); // 별도 워크스페이스

    const created = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/webhooks`, {
      cookie: owner.cookie,
      body: { url: receiver.url, events: ["agent.auto_disabled"] },
    });
    expect(created.status).toBe(201);

    const createAttempt = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/webhooks`, {
      cookie: other.cookie,
      body: { url: receiver.url, events: ["agent.auto_disabled"] },
    });
    expect(createAttempt.status).toBe(403);

    const listAttempt = await http(h, "GET", `/v1/workspaces/${owner.workspaceId}/webhooks`, {
      cookie: other.cookie,
    });
    expect(listAttempt.status).toBe(403);

    const deleteAttempt = await http(
      h,
      "DELETE",
      `/v1/workspaces/${owner.workspaceId}/webhooks/${created.json.webhook.id}`,
      { cookie: other.cookie },
    );
    expect(deleteAttempt.status).toBe(403);
  });
});

// ---------- HMAC 서명 ----------
describe("웹훅 발송 — HMAC 서명 검증", () => {
  it("conversation.handoff 발송 시 서명이 secret으로 재현된다", async () => {
    const s = await newVisitorSession(h);
    // active agent가 있어야 새 대화가 mode=ai로 시작 — 그래야 handoff 요청이 mode 전환을 유발해
    // performHandoff(→conversation.handoff 웹훅)가 실제로 실행된다(이미 human이면 멱등 no-op).
    await registerMockAgent(h, s.workspaceId, receiver.url);
    await registerMockWebhook(h, s.workspaceId, receiver.url, ["conversation.handoff"], {
      secret: "whsec_fixed_test_secret_value",
    });
    const convId = await newConversation(h, s.token);

    await http(h, "POST", "/v1/widget/handoff", {
      token: s.token,
      body: { conversationId: convId },
    });
    await drainWebhooks(h);

    expect(receiver.requestCount()).toBe(1);
    const req = receiver.lastRequest()!;
    const ts = req.headers["x-aidetalk-timestamp"]!;
    const expected = createHmac("sha256", "whsec_fixed_test_secret_value")
      .update(`${ts}.${req.rawBody}`)
      .digest("hex");
    expect(req.headers["x-aidetalk-signature"]).toBe(expected);

    const body = req.json as { event: string; data: { conversationId: string; reason: string } };
    expect(body.event).toBe("conversation.handoff");
    expect(body.data.conversationId).toBe(convId);
  });
});

// ---------- auto_disabled 구독 발송 / 미구독 미발송 ----------
describe("agent.auto_disabled 이벤트", () => {
  /** reply 5회 연속 실패를 유발해 auto_disabled를 트리거한다(각 실패는 별도 대화, 09 §3-4와 동일 패턴). */
  async function triggerAutoDisable(token: string) {
    for (let i = 0; i < 5; i++) {
      const convId = await newConversation(h, token); // active agent → mode=ai
      await http(h, "POST", `/v1/widget/conversations/${convId}/messages`, {
        token,
        body: { clientMsgId: `c_${i}_${Math.random().toString(36).slice(2)}`, text: `q${i}` },
      });
      await drainDispatch(h);
    }
  }

  it("구독한 웹훅에만 발송된다", async () => {
    const s = await newVisitorSession(h);
    const mockAgent = await startMockAgent({ status: 500, response: { type: "reply", text: "x" } });
    try {
      const { agentId } = await registerMockAgent(h, s.workspaceId, mockAgent.url);
      await registerMockWebhook(h, s.workspaceId, receiver.url, ["agent.auto_disabled"]);

      await triggerAutoDisable(s.token);

      const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
      expect(agent!.status).toBe("auto_disabled");

      await drainWebhooks(h);
      expect(receiver.requestCount()).toBe(1);
      const body = receiver.lastRequest()!.json as {
        event: string;
        data: { agentId: string; agentName: string; failureCount: number };
      };
      expect(body.event).toBe("agent.auto_disabled");
      expect(body.data.agentId).toBe(agentId);
      expect(body.data.failureCount).toBe(5);
    } finally {
      await mockAgent.close();
    }
  });

  it("미구독 이벤트는 발송되지 않는다", async () => {
    const s = await newVisitorSession(h);
    const mockAgent = await startMockAgent({ status: 500, response: { type: "reply", text: "x" } });
    try {
      const { agentId } = await registerMockAgent(h, s.workspaceId, mockAgent.url);
      // conversation.handoff만 구독 — agent.auto_disabled는 구독하지 않음.
      // (reply 실패마다 handoff_auto 경로가 conversation.handoff는 매번 발송하므로,
      //  이 테스트는 "agent.auto_disabled가 한 번도 안 왔는지"로 검증한다.)
      await registerMockWebhook(h, s.workspaceId, receiver.url, ["conversation.handoff"]);

      await triggerAutoDisable(s.token);
      const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
      expect(agent!.status).toBe("auto_disabled");

      await drainWebhooks(h);
      const events = receiver.allRequests().map((r) => (r.json as { event: string }).event);
      expect(events.length).toBeGreaterThan(0); // conversation.handoff는 정상 수신(구독함).
      expect(events).not.toContain("agent.auto_disabled"); // 미구독 이벤트는 절대 발송되지 않음.
    } finally {
      await mockAgent.close();
    }
  });
});

// ---------- 재시도 스케줄 ----------
// ⚠️ 재시도 지연(운영값 1m/5m/30m)은 fake timer + 실제 fetch 조합이 불안정(다른 테스트 파일까지
//   영향)하므로, 여기서는 HttpWebhookDispatcher에 짧은 지연을 주입해 실제 시간으로 스케줄만 검증한다.
describe("웹훅 재시도 스케줄", () => {
  it("실패 2회 후 3번째 성공 — 예약된 지연만큼만 재시도한다", async () => {
    const s = await newVisitorSession(h);
    await registerMockWebhook(h, s.workspaceId, receiver.url, ["conversation.handoff"]);

    const original = h.ctx.webhookDispatcher;
    const fast = new HttpWebhookDispatcher(h.ctx, { retryDelaysMs: [30, 60, 90] });
    h.ctx.webhookDispatcher = fast;
    try {
      receiver.setBehavior({ status: 500 });
      fast.dispatch(s.workspaceId, "conversation.handoff", {
        conversationId: "conv_test",
        reason: "test",
      });

      // 최초 시도(1회차).
      await sleep(20);
      expect(receiver.requestCount()).toBe(1);

      // 30ms 지연 후 재시도(2회차) — 여전히 실패.
      await sleep(40);
      expect(receiver.requestCount()).toBe(2);

      // 이제 성공 응답으로 전환 후 60ms 지연 재시도(3회차) — 성공.
      receiver.setBehavior({ status: 200 });
      await sleep(80);
      expect(receiver.requestCount()).toBe(3);

      // 성공했으므로 3번째 재시도(90ms) 지연을 넘겨도 추가 요청은 없다.
      await sleep(120);
      expect(receiver.requestCount()).toBe(3);
    } finally {
      h.ctx.webhookDispatcher = original;
    }
  });
});
