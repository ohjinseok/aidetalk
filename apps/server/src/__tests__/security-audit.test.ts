/**
 * M2 보안 점검(08_SECURITY.md) 감사에서 추가·보강한 항목의 회귀 테스트.
 *  - §3 CSRF Origin 화이트리스트(쿠키 인증 경로).
 *  - §2 Agent 응답 Content-Type 검증.
 *  - §5 WS 동일 visitor 동시 연결 상한 + 연결당 인바운드 플러드 가드.
 *  - §5 워크스페이스별 dispatch 동시성 상한(KeyedSemaphore 단위).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DISPATCH_CONCURRENCY_PER_WORKSPACE, KeyedSemaphore } from "../dispatcher";
import {
  createHarness,
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

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

// ================= §3 CSRF Origin 화이트리스트 =================
describe("08 §3 CSRF Origin 화이트리스트(쿠키 인증 경로)", () => {
  it("상태 변경 요청에 외부 Origin → 403 auth/forbidden", async () => {
    const m = await newUserWithWorkspace(h);
    const res = await http(h, "POST", `/v1/workspaces`, {
      cookie: m.cookie,
      body: { name: "새 워크스페이스", segment: "s1_site" },
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("auth/forbidden");
  });

  it("허용 Origin(DASHBOARD_URL)이면 통과", async () => {
    const m = await newUserWithWorkspace(h);
    const res = await http(h, "POST", `/v1/workspaces`, {
      cookie: m.cookie,
      body: { name: "새 워크스페이스", segment: "s1_site" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(201);
  });

  it("Origin 헤더 부재(비브라우저 클라이언트)는 통과", async () => {
    const m = await newUserWithWorkspace(h);
    const res = await http(h, "POST", `/v1/workspaces`, {
      cookie: m.cookie,
      body: { name: "새 워크스페이스", segment: "s1_site" },
    });
    expect(res.status).toBe(201);
  });

  it("GET(안전 메서드)은 외부 Origin이어도 검증 대상 아님", async () => {
    const m = await newUserWithWorkspace(h);
    const res = await http(h, "GET", `/v1/workspaces/${m.workspaceId}`, {
      cookie: m.cookie,
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(200);
  });
});

// ================= §2 Agent 응답 Content-Type 검증 =================
describe("08 §2 Agent 응답 Content-Type 검증", () => {
  let mock: MockAgent;
  beforeEach(async () => {
    mock = await startMockAgent();
  });
  afterEach(async () => {
    await mock.close();
  });

  it("JSON이 아닌 Content-Type 응답 → test 엔드포인트가 bad_content_type로 실패", async () => {
    const m = await newUserWithWorkspace(h);
    const created = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "봇", endpointUrl: mock.url, timeoutMs: 1000 },
    });
    // 계약상 JSON 본문이지만 Content-Type을 text/html로 위장.
    mock.setBehavior({
      response: { type: "reply", text: "pong" },
      contentType: "text/html",
    });
    const res = await http(
      h,
      "POST",
      `/v1/workspaces/${m.workspaceId}/agents/${created.json.agent.id}/test`,
      { cookie: m.cookie },
    );
    expect(res.json.ok).toBe(false);
    expect(res.json.error).toBe("bad_content_type");
  });

  it("application/json이면 정상 처리", async () => {
    const m = await newUserWithWorkspace(h);
    const created = await http(h, "POST", `/v1/workspaces/${m.workspaceId}/agents`, {
      cookie: m.cookie,
      body: { name: "봇", endpointUrl: mock.url, timeoutMs: 1000 },
    });
    mock.setBehavior({
      response: { type: "reply", text: "pong" },
      contentType: "application/json; charset=utf-8",
    });
    const res = await http(
      h,
      "POST",
      `/v1/workspaces/${m.workspaceId}/agents/${created.json.agent.id}/test`,
      { cookie: m.cookie },
    );
    expect(res.json.ok).toBe(true);
  });
});

// ================= §5 WS 동시 연결 상한 =================
describe("08 §5 WS 동일 visitor 동시 연결 상한(5)", () => {
  it("6번째 연결은 4429로 거부된다", async () => {
    const s = await newVisitorSession(h);
    const url = `${h.wsBase}/ws/visitor?token=${s.token}`;
    const open: WsClient[] = [];
    for (let i = 0; i < 5; i++) open.push(await WsClient.connect(url));

    // 6번째는 즉시 4429 close.
    const sixth = await WsClient.connect(url);
    const code = await sixth.closed();
    expect(code).toBe(4429);

    // 하나 닫으면 다시 여유 슬롯 생겨 접속 가능.
    open[0]!.close();
    await open[0]!.closed().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 100));
    const reconnected = await WsClient.connect(url);
    expect(reconnected).toBeInstanceOf(WsClient);
    reconnected.close();
    for (const c of open.slice(1)) c.close();
  });
});

// ================= §5 WS 인바운드 플러드 가드 =================
describe("08 §5 WS 연결당 인바운드 플러드 가드(30/10s)", () => {
  it("윈도 내 30개 초과 프레임은 rate/limited error 후 drop", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const ws = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${s.token}`);
    ws.send("conversation.subscribe", { conversationId: convId });

    // typing.set 프레임 40개를 빠르게 전송(메시지 전송 한도와 무관한 인바운드 프레임).
    for (let i = 0; i < 40; i++) {
      ws.send("typing.set", { conversationId: convId, isTyping: i % 2 === 0 });
    }
    // 초과분에 대해 rate/limited error 이벤트가 최소 1회 도착해야 한다.
    const err = await ws.nextType("error");
    expect(err.payload.code).toBe("rate/limited");
    ws.close();
  });
});

// ================= §5 dispatch 동시성 상한(단위) =================
describe("08 §5 KeyedSemaphore(워크스페이스별 dispatch 동시성)", () => {
  it("상한만큼만 동시 활성, 초과분은 대기하다 슬롯이 나면 진행", async () => {
    const sem = new KeyedSemaphore(2);
    await sem.acquire("ws_a");
    await sem.acquire("ws_a");
    expect(sem.activeCount("ws_a")).toBe(2);

    let thirdAcquired = false;
    const third = sem.acquire("ws_a").then(() => {
      thirdAcquired = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(thirdAcquired).toBe(false); // 슬롯 없어 대기 중.

    sem.release("ws_a"); // 슬롯 이양 → 대기자 진행.
    await third;
    expect(thirdAcquired).toBe(true);

    // 다른 키는 독립적으로 카운트.
    expect(sem.activeCount("ws_b")).toBe(0);
  });

  it("기본 상한은 10", () => {
    expect(DISPATCH_CONCURRENCY_PER_WORKSPACE).toBe(10);
  });
});
