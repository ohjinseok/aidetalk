/**
 * 09_TESTING.md §4 — 권한 격리(08 §3 불변식) + 위조 visitor_token 401 + membership 403.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createHarness,
  http,
  newConversation,
  newUserWithWorkspace,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("09 §4-4 위조 visitor_token", () => {
  it("서명 불일치 토큰 → 401 auth/invalid", async () => {
    const s = await newVisitorSession(h);
    // 서명 마지막 글자 변조.
    const forged = s.token.slice(0, -1) + (s.token.endsWith("a") ? "b" : "a");
    const res = await http(h, "POST", "/v1/widget/conversations", {
      token: forged,
      body: {},
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("auth/invalid");
  });

  it("형식이 깨진 토큰 → 401", async () => {
    const res = await http(h, "POST", "/v1/widget/conversations", {
      token: "not-a-real-token",
      body: {},
    });
    expect(res.status).toBe(401);
  });

  it("위조 토큰으로 WS 접속 → 4401 close", async () => {
    const s = await newVisitorSession(h);
    const forged = s.token.slice(0, -1) + "z";
    const ws = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${forged}`);
    const code = await ws.closed();
    expect(code).toBe(4401);
  });
});

describe("09 §4-1 visitor 자격으로 상담원 자원 접근 차단(경로 파라미터 fuzz)", () => {
  it("visitor_token(Bearer)으로 /v1/workspaces/* 5경로 → 전부 401/403", async () => {
    const s = await newVisitorSession(h);
    const paths = [
      "/v1/workspaces/ws_aaaaaaaaaaaaaaaa",
      "/v1/workspaces/ws_bbbbbbbbbbbbbbbb",
      `/v1/workspaces/${s.workspaceId}`,
      `/v1/workspaces/${s.workspaceId}/conversations`,
      "/v1/me",
    ];
    for (const p of paths) {
      const res = await http(h, "GET", p, { token: s.token });
      expect([401, 403]).toContain(res.status);
      expect(res.json?.error?.code === undefined ? "auth/invalid" : res.json.error.code).not.toBe(
        undefined,
      );
    }
  });

  it("visitor_token(Bearer)으로 suggestions 경로 → 200 아님(원천 차단)", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const res = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/suggestions`,
      { token: s.token },
    );
    expect(res.status).not.toBe(200);
  });
});

describe("09 §4-3 타 워크스페이스 멤버의 자원 접근", () => {
  it("다른 워크스페이스 멤버 → 403 auth/forbidden, 본인 워크스페이스는 200", async () => {
    const a = await newUserWithWorkspace(h);
    const b = await newUserWithWorkspace(h);

    // b가 a의 워크스페이스 접근 → 403.
    const forbidden = await http(h, "GET", `/v1/workspaces/${a.workspaceId}`, { cookie: b.cookie });
    expect(forbidden.status).toBe(403);
    expect(forbidden.json.error.code).toBe("auth/forbidden");

    // 본인 워크스페이스는 200.
    const ok = await http(h, "GET", `/v1/workspaces/${a.workspaceId}`, { cookie: a.cookie });
    expect(ok.status).toBe(200);
    expect(ok.json.workspace.id).toBe(a.workspaceId);
  });
});

describe("09 §4 visitor_token으로 메모/태그/즐겨찾기/counts 접근 차단(메모 미노출 계약 고정)", () => {
  it("visitor_token(Bearer)으로 notes/tags/favorite/counts 경로 → 전부 401", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const cases: [string, string][] = [
      ["GET", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/notes`],
      ["GET", `/v1/workspaces/${s.workspaceId}/tags`],
      ["PUT", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/favorite`],
      ["DELETE", `/v1/workspaces/${s.workspaceId}/conversations/${convId}/favorite`],
      ["GET", `/v1/workspaces/${s.workspaceId}/conversations/counts`],
    ];
    for (const [method, path] of cases) {
      const res = await http(h, method, path, { token: s.token });
      expect(res.status).toBe(401);
      expect(res.json.error.code).toBe("auth/invalid");
    }
  });
});

describe("09 §4-2 suggestion.new 채널 격리(WS 통합)", () => {
  it("같은 대화에 agent+visitor 소켓 → suggestion.new는 agent만, visitor 미수신", async () => {
    // 워크스페이스 + 멤버(상담원) + 방문자 세션을 같은 워크스페이스에 구성.
    const member = await newUserWithWorkspace(h);
    const ws = await h.ctx.repos.workspace.getById(member.workspaceId);
    expect(ws).toBeTruthy();

    // 같은 워크스페이스에서 방문자 세션 발급.
    const sess = await http(h, "POST", "/v1/widget/session", {
      body: { workspaceId: member.workspaceId },
    });
    const token = sess.json.visitorToken as string;
    const convId = await newConversation(h, token);

    // visitor 소켓: 메시지 전송으로 conv:all 구독.
    const visitorWs = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${token}`);
    visitorWs.send("message.send", { conversationId: convId, clientMsgId: "v1", text: "질문" });
    await visitorWs.nextType("message.ack");

    // agent 소켓: 대화 구독(conv:all + conv:agents).
    const agentWs = await WsClient.connect(`${h.wsBase}/ws/agent`, { cookie: member.cookie });
    agentWs.send("subscribe.conversation", { conversationId: convId });
    await sleep(250); // 구독 완료 대기

    // 어시스트 제안 발행(agents 채널).
    const suggestion = {
      id: "asg_test000000000",
      conversationId: convId,
      triggerMessageId: "msg_test00000000",
      draft: "이렇게 답해보세요",
      rationale: null,
      actions: null,
      source: "agent" as const,
      outcome: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    await h.ctx.broadcaster.suggestionNew(convId, suggestion);

    // agent는 수신.
    const got = await agentWs.nextType("suggestion.new");
    expect(got.payload.suggestion.id).toBe("asg_test000000000");

    // visitor는 절대 수신하지 않음.
    await visitorWs.expectNone((m) => m.type === "suggestion.new", 400);

    visitorWs.close();
    agentWs.close();
  });
});
