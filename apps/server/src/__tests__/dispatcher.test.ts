/**
 * 09_TESTING.md §3 — Agent Dispatcher 필수 커버리지 1~7 + mode=human reply 0건 + ping.
 * 실제 Postgres + 모의 에이전트(로컬 HTTP)로 통합 검증한다.
 */
import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { signBody } from "../dispatch/http";
import { sendVisitorMessage } from "../services/messaging";
import {
  createHarness,
  drainDispatch,
  http,
  newConversation,
  newUserWithWorkspace,
  newVisitorSession,
  registerMockAgent,
  WsClient,
  type Harness,
} from "../../test/harness";
import { startMockAgent, type MockAgent } from "../../test/mock-agent";

let h: Harness;
let mock: MockAgent;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  mock = await startMockAgent();
});
afterEach(async () => {
  await mock.close();
});

/** 손님 메시지 1건 전송 후 dispatch 완료 대기. 반환: 메시지 id. */
async function sendAndDrain(
  session: { workspaceId: string; visitorId: string },
  conversationId: string,
  text: string,
  clientMsgId = `c_${Math.random().toString(36).slice(2)}`,
): Promise<void> {
  await sendVisitorMessage(h.ctx, {
    visitor: { visitorId: session.visitorId, workspaceId: session.workspaceId },
    conversationId,
    clientMsgId,
    text,
  });
  await drainDispatch(h);
}

async function allMessages(workspaceId: string, conversationId: string) {
  return h.ctx.repos.message.listAfter(workspaceId, conversationId, undefined, 200);
}

// ---------- 09 §3-5 HMAC 스냅샷(단위) ----------
describe("09 §3-5 HMAC 서명(스펙 스냅샷)", () => {
  it("고정 secret·timestamp·body → 기대 해시", () => {
    const { timestamp, signature } = signBody("adt_test_secret", '{"hello":"world"}', 1700000000);
    expect(timestamp).toBe("1700000000");
    expect(signature).toBe(
      "04d0c17e2c1cca1a7f66f1e25a4a14a2bd878ae396a256129d4073b8b9bf3680",
    );
  });
});

// ---------- 09 §3-1 reply 정상 + track_links ----------
describe("09 §3-1 reply 정상 + track_links", () => {
  it("agent_ai 저장·URL 치환·tracked_links 생성·failure_count=0", async () => {
    const s = await newVisitorSession(h);
    const { agentId, secret } = await registerMockAgent(h, s.workspaceId, mock.url);
    mock.setBehavior({
      response: {
        type: "reply",
        text: "확인하세요 https://shop.example.com/a 그리고 https://shop.example.com/b",
        quick_replies: ["다른 문의"],
      },
    });
    const convId = await newConversation(h, s.token);
    await sendAndDrain(s, convId, "배송 언제 와요?");

    const msgs = await allMessages(s.workspaceId, convId);
    const aiMsg = msgs.find((m) => m.role === "agent_ai");
    expect(aiMsg).toBeTruthy();
    expect(aiMsg!.content.text).toContain("https://shop.example.com/a?at_l=");
    expect(aiMsg!.content.text).toContain("https://shop.example.com/b?at_l=");
    expect(aiMsg!.content.quickReplies).toEqual(["다른 문의"]);

    const links = await h.ctx.repos.trackedLink.listByConversation(s.workspaceId, convId);
    expect(links).toHaveLength(2);
    expect(new Set(links.map((l) => l.token)).size).toBe(2);
    expect(links.every((l) => l.messageId === aiMsg!.id)).toBe(true);

    const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
    expect(agent!.failureCount).toBe(0);
    expect(agent!.status).toBe("active");

    // HMAC 통합 검증 — mock이 받은 서명이 secret으로 재현되는지.
    const req = mock.lastRequest()!;
    const ts = req.headers["x-aidetalk-timestamp"]!;
    const expected = createHmac("sha256", secret).update(`${ts}.${req.rawBody}`).digest("hex");
    expect(req.headers["x-aidetalk-signature"]).toBe(expected);
    expect(Math.abs(Date.now() / 1000 - Number(ts))).toBeLessThan(30);
    // 요청 본문 계약 확인.
    const body = req.json as { mode: string; message: { text: string } };
    expect(body.mode).toBe("reply");
    expect(body.message.text).toBe("배송 언제 와요?");
  });
});

// ---------- 09 §3-2 handoff ----------
describe("09 §3-2 handoff", () => {
  it("mode=human 전환·이벤트·안내 발송, 이후 reply dispatch 미발생", async () => {
    const s = await newVisitorSession(h);
    await registerMockAgent(h, s.workspaceId, mock.url);
    mock.setBehavior({
      response: {
        type: "handoff",
        reason: "환불 요청",
        summary: "카드 결제 환불",
        message_to_visitor: "상담원을 연결할게요!",
      },
    });
    const convId = await newConversation(h, s.token);
    await sendAndDrain(s, convId, "환불하고 싶어요");

    const conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.mode).toBe("human");

    const events = await h.ctx.repos.event.listByConversation(s.workspaceId, convId);
    expect(events.some((e) => e.type === "handoff_agent")).toBe(true);

    const msgs = await allMessages(s.workspaceId, convId);
    expect(msgs.some((m) => m.role === "system" && m.content.text === "상담원을 연결할게요!")).toBe(
      true,
    );
    expect(msgs.some((m) => m.role === "agent_ai")).toBe(false);

    // 이후 손님 메시지 → assist dispatch(reply 아님).
    mock.setBehavior({ response: { type: "noop" } });
    await sendAndDrain(s, convId, "언제 처리되나요?");
    expect(mock.lastRequest()!.json).toMatchObject({ mode: "assist" });
    const after = await allMessages(s.workspaceId, convId);
    expect(after.some((m) => m.role === "agent_ai")).toBe(false); // reply 미발생
  });
});

// ---------- 09 §3-3 실패 → 자동 핸드오프 ----------
describe("09 §3-3 dispatch 실패 자동 핸드오프", () => {
  async function expectAutoHandoff(
    behavior: Parameters<MockAgent["setBehavior"]>[0],
    expectedOutcome: "timeout" | "error",
    timeoutMs = 30000,
  ) {
    const s = await newVisitorSession(h);
    const { agentId } = await registerMockAgent(h, s.workspaceId, mock.url, { timeoutMs });
    mock.setBehavior(behavior);
    const convId = await newConversation(h, s.token);
    await sendAndDrain(s, convId, "질문");

    const conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.mode).toBe("human"); // 자동 핸드오프

    const msgs = await allMessages(s.workspaceId, convId);
    expect(msgs.some((m) => m.role === "system")).toBe(true); // 기본 안내

    const events = await h.ctx.repos.event.listByConversation(s.workspaceId, convId);
    expect(events.some((e) => e.type === "handoff_auto")).toBe(true);

    const logs = await h.ctx.repos.agentLog.listByAgent(s.workspaceId, agentId);
    expect(logs[0]!.outcome).toBe(expectedOutcome);

    const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
    expect(agent!.failureCount).toBe(1);
  }

  it("타임아웃 → outcome=timeout", async () => {
    await expectAutoHandoff({ delayMs: 400 }, "timeout", 150);
  });
  it("5xx → outcome=error", async () => {
    await expectAutoHandoff({ status: 500, response: { type: "reply", text: "x" } }, "error");
  });
  it("스키마 불일치 → outcome=error", async () => {
    await expectAutoHandoff({ raw: '{"type":"unknown_kind"}' }, "error");
  });
  it("64KB 초과 → outcome=error", async () => {
    const huge = `{"type":"reply","text":"${"a".repeat(70 * 1024)}"}`;
    await expectAutoHandoff({ raw: huge }, "error");
  });
});

// ---------- 09 §3-4 연속 5회 실패 → auto_disabled ----------
describe("09 §3-4 auto_disable", () => {
  it("reply 5회 실패 → status=auto_disabled, 6번째 dispatch 미발생", async () => {
    const s = await newVisitorSession(h);
    const { agentId } = await registerMockAgent(h, s.workspaceId, mock.url);
    mock.setBehavior({ status: 500, response: { type: "reply", text: "x" } });

    // 각 실패는 해당 대화를 human으로 만들므로 실패 5회는 서로 다른 대화에서 누적.
    for (let i = 0; i < 5; i++) {
      const convId = await newConversation(h, s.token); // agent active → mode=ai
      await sendAndDrain(s, convId, `q${i}`);
    }
    const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
    expect(agent!.failureCount).toBe(5);
    expect(agent!.status).toBe("auto_disabled");

    const before = mock.requestCount();
    // 6번째 — 이제 active agent 없음 → dispatch 미발생.
    const convId6 = await newConversation(h, s.token); // mode=human(agent 비활성)
    await sendAndDrain(s, convId6, "q6");
    expect(mock.requestCount()).toBe(before);
  });
});

// ---------- 09 §3-6 assist ----------
describe("09 §3-6 assist", () => {
  it("suggest 저장 + agents 채널 push", async () => {
    const member = await newUserWithWorkspace(h);
    const wsId = member.workspaceId;
    await registerMockAgent(h, wsId, mock.url);

    // 같은 워크스페이스 방문자 세션 + 대화(mode=ai) → human 전환.
    const sess = await http(h, "POST", "/v1/widget/session", { body: { workspaceId: wsId } });
    const token = sess.json.visitorToken as string;
    const visitorId = sess.json.visitor.id as string;
    const convId = await newConversation(h, token);
    await h.ctx.repos.conversation.setMode(wsId, convId, "human");

    // agent WS로 대화 구독(conv:agents).
    const agentWs = await WsClient.connect(`${h.wsBase}/ws/agent`, { cookie: member.cookie });
    agentWs.send("subscribe.conversation", { conversationId: convId });
    await new Promise((r) => setTimeout(r, 200));

    mock.setBehavior({
      response: { type: "suggest", draft: "재고 2개 남았어요!", rationale: "구매 임박" },
    });
    await sendAndDrain({ workspaceId: wsId, visitorId }, convId, "재고 있나요?");

    // 저장 확인(memberContext 필요).
    const rows = await h.ctx.repos.assist.listByConversation(wsId, convId, {
      userId: member.userId,
      workspaceId: wsId,
      role: "owner",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.draft).toBe("재고 2개 남았어요!");

    // agents 채널 push 수신.
    const got = await agentWs.nextType("suggestion.new");
    expect(got.payload.suggestion.draft).toBe("재고 2개 남았어요!");
    agentWs.close();
  });

  it("assist 실패 → 조용히 스킵, failure_count 미반영, 핸드오프 없음", async () => {
    const s = await newVisitorSession(h);
    const { agentId } = await registerMockAgent(h, s.workspaceId, mock.url);
    const convId = await newConversation(h, s.token);
    await h.ctx.repos.conversation.setMode(s.workspaceId, convId, "human");

    mock.setBehavior({ status: 500, response: { type: "suggest", draft: "x" } });
    await sendAndDrain(s, convId, "질문");

    const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
    expect(agent!.failureCount).toBe(0); // 미반영
    const conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.mode).toBe("human"); // 핸드오프 없음(이미 human)
    const rows = await h.ctx.repos.assist.listByConversation(s.workspaceId, convId, {
      userId: "u",
      workspaceId: s.workspaceId,
      role: "owner",
    });
    expect(rows).toHaveLength(0);
  });

  it("assist noop → 무동작", async () => {
    const s = await newVisitorSession(h);
    await registerMockAgent(h, s.workspaceId, mock.url);
    const convId = await newConversation(h, s.token);
    await h.ctx.repos.conversation.setMode(s.workspaceId, convId, "human");
    mock.setBehavior({ response: { type: "noop" } });
    await sendAndDrain(s, convId, "감사합니다");
    const rows = await h.ctx.repos.assist.listByConversation(s.workspaceId, convId, {
      userId: "u",
      workspaceId: s.workspaceId,
      role: "owner",
    });
    expect(rows).toHaveLength(0);
  });
});

// ---------- 09 §3-7 mode 불일치 응답 ----------
describe("09 §3-7 mode 불일치 응답", () => {
  it("reply 모드에 suggest 응답 → 에러 처리(자동 핸드오프)", async () => {
    const s = await newVisitorSession(h);
    const { agentId } = await registerMockAgent(h, s.workspaceId, mock.url);
    mock.setBehavior({ response: { type: "suggest", draft: "x" } });
    const convId = await newConversation(h, s.token);
    await sendAndDrain(s, convId, "질문");

    const conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.mode).toBe("human"); // bad_response → 자동 핸드오프
    const logs = await h.ctx.repos.agentLog.listByAgent(s.workspaceId, agentId);
    expect(logs[0]!.outcome).toBe("error");
    const agent = await h.ctx.repos.agent.getById(s.workspaceId, agentId);
    expect(agent!.failureCount).toBe(1);
  });
});

// ---------- mode=human reply dispatch 0건 ----------
describe("mode=human 동안 reply dispatch 0건", () => {
  it("human 대화의 손님 메시지는 assist만, agent_ai 미생성", async () => {
    const s = await newVisitorSession(h);
    await registerMockAgent(h, s.workspaceId, mock.url);
    const convId = await newConversation(h, s.token);
    await h.ctx.repos.conversation.setMode(s.workspaceId, convId, "human");
    // assist에 reply를 반환하더라도(잘못된 조합) 손님에게 나가지 않아야 함.
    mock.setBehavior({ response: { type: "reply", text: "손님에게 가면 안 됨" } });
    await sendAndDrain(s, convId, "안녕");
    const msgs = await allMessages(s.workspaceId, convId);
    expect(msgs.some((m) => m.role === "agent_ai")).toBe(false);
    expect(mock.lastRequest()!.json).toMatchObject({ mode: "assist" });
  });
});
