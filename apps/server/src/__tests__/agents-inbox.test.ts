/**
 * 04_API_SPEC.md §2 — Agent 커넥터 CRUD/test/logs + 인박스 REST + 멤버/설정.
 * 09_TESTING.md §4 권한 격리 보강(visitor→상담원 자원, 타 워크스페이스 멤버).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sendVisitorMessage } from "../services/messaging";
import {
  createHarness,
  drainDispatch,
  http,
  newConversation,
  newUserWithWorkspace,
  newVisitorSession,
  registerMockAgent,
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

/** 멤버(owner) + 같은 워크스페이스 방문자 세션 구성. */
async function setup() {
  const member = await newUserWithWorkspace(h);
  const sess = await http(h, "POST", "/v1/widget/session", {
    body: { workspaceId: member.workspaceId },
  });
  return {
    ...member,
    token: sess.json.visitorToken as string,
    visitorId: sess.json.visitor.id as string,
  };
}

// ================= Agent 커넥터 CRUD =================
describe("Agent 커넥터 CRUD", () => {
  it("생성 시 secret 1회 노출, 목록에는 secret 미포함", async () => {
    const m = await newUserWithWorkspace(h);
    const res = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "봇", endpointUrl: mock.url },
    });
    expect(res.status).toBe(201);
    expect(res.json.secret).toMatch(/^adt_/);
    expect(res.json.agent.status).toBe("active");
    expect(res.json.agent.secret).toBeUndefined();

    const list = await http(h, "GET", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
    });
    expect(list.json.items).toHaveLength(1);
    const a = list.json.items[0];
    expect(a.secret).toBeUndefined();
    expect(a.secretHash).toBeUndefined();
    expect(a.secretEnc).toBeUndefined();
  });

  it("active 전환 시 기존 active 자동 disabled(1개 제약)", async () => {
    const m = await newUserWithWorkspace(h);
    const a1 = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "a1", endpointUrl: mock.url },
    });
    // a1 비활성화 후 a2 생성(active).
    await http(h, "PATCH", `/v1/workspaces/${m.workspaceId}/agents/${a1.json.agent.id}`, {
      cookie: m.cookie,
      body: { status: "disabled" },
    });
    const a2 = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "a2", endpointUrl: mock.url },
    });
    // a1을 다시 active로 → a2 자동 disabled.
    const patched = await http(
      h,
      "PATCH",
      `/v1/workspaces/${m.workspaceId}/agents/${a1.json.agent.id}`,
      { cookie: m.cookie, body: { status: "active" } },
    );
    expect(patched.json.agent.status).toBe("active");
    const active = await h.ctx.repos.agent.getActive(m.workspaceId);
    expect(active!.id).toBe(a1.json.agent.id);
    const a2row = await h.ctx.repos.agent.getById(m.workspaceId, a2.json.agent.id);
    expect(a2row!.status).toBe("disabled");
  });

  it("rotate-secret → 새 secret 1회 노출", async () => {
    const m = await newUserWithWorkspace(h);
    const created = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "봇", endpointUrl: mock.url },
    });
    const rot = await http(
      h,
      "POST",
      `/v1/workspaces/${m.workspaceId}/agents/${created.json.agent.id}/rotate-secret`,
      { cookie: m.cookie },
    );
    expect(rot.json.secret).toMatch(/^adt_/);
    expect(rot.json.secret).not.toBe(created.json.secret);
  });

  it("test 엔드포인트 — 정상 ping ok, 타임아웃 실패", async () => {
    const m = await newUserWithWorkspace(h);
    const created = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "봇", endpointUrl: mock.url, timeoutMs: 1000 },
    });
    mock.setBehavior({ response: { type: "reply", text: "pong" } });
    const ok = await http(
      h,
      "POST",
      `/v1/workspaces/${m.workspaceId}/agents/${created.json.agent.id}/test`,
      { cookie: m.cookie },
    );
    expect(ok.json.ok).toBe(true);
    expect(typeof ok.json.latencyMs).toBe("number");
    expect(ok.json.response.type).toBe("reply");

    mock.setBehavior({ delayMs: 1500 });
    const fail = await http(
      h,
      "POST",
      `/v1/workspaces/${m.workspaceId}/agents/${created.json.agent.id}/test`,
      { cookie: m.cookie },
    );
    expect(fail.json.ok).toBe(false);
    expect(fail.json.error).toBe("timeout");
  });

  it("agent-logs 목록 — dispatch 후 기록 조회", async () => {
    const s = await setup();
    const { agentId } = await registerMockAgent(h, s.workspaceId, mock.url);
    mock.setBehavior({ response: { type: "reply", text: "안녕하세요" } });
    const convId = await newConversation(h, s.token);
    await sendVisitorMessage(h.ctx, {
      visitor: { visitorId: s.visitorId, workspaceId: s.workspaceId },
      conversationId: convId,
      clientMsgId: "c1",
      text: "질문",
    });
    await drainDispatch(h);

    const logs = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/agent-logs?agentId=${agentId}`,
      { cookie: s.cookie },
    );
    expect(logs.json.items.length).toBeGreaterThanOrEqual(1);
    expect(logs.json.items[0].outcome).toBe("reply");
    // 요약만 — 시크릿/전문 없음.
    expect(JSON.stringify(logs.json.items[0])).not.toContain("adt_");
  });
});

// ================= 인박스 REST =================
describe("인박스 REST", () => {
  it("대화 목록/검색(q ILIKE)/상세/이벤트", async () => {
    const s = await setup();
    const convId = await newConversation(h, s.token); // agent 없음 → human
    await sendVisitorMessage(h.ctx, {
      visitor: { visitorId: s.visitorId, workspaceId: s.workspaceId },
      conversationId: convId,
      clientMsgId: "c1",
      text: "환불 문의합니다",
    });

    const list = await http(h, "GET", `/v1/workspaces/${s.workspaceId}/conversations`, {
      cookie: s.cookie,
    });
    expect(list.json.items.some((i: { conversation: { id: string } }) => i.conversation.id === convId)).toBe(
      true,
    );

    const hit = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations?q=${encodeURIComponent("환불")}`,
      { cookie: s.cookie },
    );
    expect(hit.json.items.some((i: { conversation: { id: string } }) => i.conversation.id === convId)).toBe(
      true,
    );
    const miss = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations?q=${encodeURIComponent("존재하지않는단어zzz")}`,
      { cookie: s.cookie },
    );
    expect(miss.json.items.some((i: { conversation: { id: string } }) => i.conversation.id === convId)).toBe(
      false,
    );

    const detail = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}`,
      { cookie: s.cookie },
    );
    expect(detail.json.conversation.id).toBe(convId);
    expect(detail.json.visitor.id).toBe(s.visitorId);
    expect(Array.isArray(detail.json.events)).toBe(true);
  });

  it("상담원 메시지(agent_human) — mode=ai면 자동 human + 배정 + 이벤트", async () => {
    const s = await setup();
    await registerMockAgent(h, s.workspaceId, mock.url); // active → 새 대화 mode=ai
    const convId = await newConversation(h, s.token);

    const res = await http(
      h,
      "POST",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/messages`,
      { cookie: s.cookie, body: { text: "제가 도와드릴게요" } },
    );
    expect(res.status).toBe(201);
    expect(res.json.message.role).toBe("agent_human");
    expect(res.json.message.authorId).toBe(s.userId);

    const conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.mode).toBe("human");
    expect(conv!.assigneeId).toBe(s.userId);
    const events = await h.ctx.repos.event.listByConversation(s.workspaceId, convId);
    expect(events.some((e) => e.type === "assigned")).toBe(true);
  });

  it("assign / return-to-ai / close / reopen 상태·이벤트", async () => {
    const s = await setup();
    const convId = await newConversation(h, s.token);

    await http(h, "POST", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/assign`, {
      cookie: s.cookie,
      body: { userId: s.userId },
    });
    let conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.assigneeId).toBe(s.userId);

    await http(h, "POST", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/return-to-ai`, {
      cookie: s.cookie,
    });
    conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.mode).toBe("ai");

    await http(h, "POST", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/close`, {
      cookie: s.cookie,
    });
    conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.status).toBe("closed");

    await http(h, "POST", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/reopen`, {
      cookie: s.cookie,
    });
    conv = await h.ctx.repos.conversation.getById(s.workspaceId, convId);
    expect(conv!.status).toBe("open");

    const events = await h.ctx.repos.event.listByConversation(s.workspaceId, convId);
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["assigned", "returned_to_ai", "closed", "reopened"]));
  });

  it("suggestions GET/PATCH(outcome)", async () => {
    const s = await setup();
    const convId = await newConversation(h, s.token);
    const msg = await h.ctx.repos.message.append(s.workspaceId, convId, {
      role: "visitor",
      authorId: s.visitorId,
      content: { type: "text", text: "재고 있나요" },
    });
    const sug = await h.ctx.repos.assist.append(s.workspaceId, {
      conversationId: convId,
      triggerMessageId: msg.id,
      draft: "재고 2개 남았어요",
    });

    const get = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/suggestions`,
      { cookie: s.cookie },
    );
    expect(get.json.items).toHaveLength(1);

    const patch = await http(h, "PATCH", `/v1/workspaces/${s.workspaceId}/suggestions/${sug.id}`, {
      cookie: s.cookie,
      body: { outcome: "accepted" },
    });
    expect(patch.json.suggestion.outcome).toBe("accepted");
  });
});

// ================= 멤버/초대/설정 =================
describe("멤버/초대/설정", () => {
  it("초대(owner) → 수락 → 목록, 삭제", async () => {
    const owner = await newUserWithWorkspace(h);
    // 초대 대상 계정(가입만).
    const invitee = await h.ctx.repos.user.create({
      email: `inv_${Math.random().toString(36).slice(2)}@example.com`,
      password: "password123",
      name: "초대대상",
    });
    const inviteeCookie = `od_session=${await h.ctx.sessionStore.create(invitee.id)}`;

    const invite = await http(h, "POST", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
      body: { email: invitee.email, role: "agent_member" },
    });
    expect(invite.status).toBe(201);
    expect(invite.json.member.status).toBe("invited");
    const token = new URL(invite.json.inviteUrl).searchParams.get("token")!;
    expect(token).toBeTruthy();

    const accept = await http(h, "POST", `/v1/invites/accept`, {
      cookie: inviteeCookie,
      body: { inviteToken: token },
    });
    expect(accept.status).toBe(200);
    expect(accept.json.member.status).toBe("active");

    const list = await http(h, "GET", `/v1/workspaces/${owner.workspaceId}/members`, {
      cookie: owner.cookie,
    });
    expect(list.json.items.length).toBe(2);

    // 삭제(owner).
    const del = await http(
      h,
      "DELETE",
      `/v1/workspaces/${owner.workspaceId}/members/${invite.json.member.id}`,
      { cookie: owner.cookie },
    );
    expect(del.status).toBe(204);
  });

  it("PATCH settings — owner만", async () => {
    const owner = await newUserWithWorkspace(h);
    const ok = await http(h, "PATCH", `/v1/workspaces/${owner.workspaceId}/settings`, {
      cookie: owner.cookie,
      body: { name: "새 이름", attributionRule: "first_click" },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.workspace.name).toBe("새 이름");
    expect(ok.json.workspace.attributionRule).toBe("first_click");

    // 비-owner(agent_member)는 403.
    const agentMember = await h.ctx.repos.user.create({
      email: `am_${Math.random().toString(36).slice(2)}@example.com`,
      password: "password123",
      name: "상담원",
    });
    await h.ctx.repos.member.addActive(owner.workspaceId, agentMember.id, "agent_member");
    const amCookie = `od_session=${await h.ctx.sessionStore.create(agentMember.id)}`;
    const forbidden = await http(h, "PATCH", `/v1/workspaces/${owner.workspaceId}/settings`, {
      cookie: amCookie,
      body: { name: "x" },
    });
    expect(forbidden.status).toBe(403);
  });
});

// ================= 09 §4 권한 격리 보강 =================
describe("09 §4 권한 격리(인박스/제안/타 워크스페이스)", () => {
  it("visitor_token으로 인박스 메시지 전송 → 401", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const res = await http(
      h,
      "POST",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/messages`,
      { token: s.token, body: { text: "x" } },
    );
    expect(res.status).toBe(401);
  });

  it("visitor_token으로 suggestions 조회 → 401", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const res = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/suggestions`,
      { token: s.token },
    );
    expect(res.status).toBe(401);
  });

  it("타 워크스페이스 멤버의 대화 접근 → 403", async () => {
    const a = await setup();
    const convId = await newConversation(h, a.token);
    const b = await newUserWithWorkspace(h);
    const res = await http(
      h,
      "GET",
      `/v1/workspaces/${a.workspaceId}/conversations/${convId}`,
      { cookie: b.cookie },
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("auth/forbidden");
  });
});
