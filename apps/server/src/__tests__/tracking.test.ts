/**
 * 09_TESTING.md §5 — 전환 트래킹 필수 커버리지(서버측).
 * 5-1(reply URL 태깅)은 dispatcher.test.ts(09 §3-1)에서 이미 검증하므로, 여기서는
 * 태깅된 링크를 실제로 "클릭"하는 왕복까지 포함해 5-1~5-5 + 레이트리밋/대시보드 조회를 검증한다.
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
let ipCounter = 0;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 테스트마다 다른 IP를 부여해 /t/* 레이트리밋 버킷(04 §0.2, IP 단위)이 서로 간섭하지 않게 한다. */
function freshIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

// ---------- 09 §5-1 링크 태깅 → /t/click 클릭 기록(왕복) ----------
describe("09 §5-1 링크 태깅 → 클릭 기록", () => {
  it("AI reply의 at_l 토큰을 실제로 클릭하면 clickedAt이 기록된다", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);
    await registerMockAgent(h, s.workspaceId, mock.url);
    mock.setBehavior({
      response: { type: "reply", text: "안내: https://shop.example.com/item/1" },
    });
    const convId = await newConversation(h, s.token);
    await sendVisitorMessage(h.ctx, {
      visitor: { visitorId: s.visitorId, workspaceId: s.workspaceId },
      conversationId: convId,
      clientMsgId: `c_${Math.random().toString(36).slice(2)}`,
      text: "이거 어디서 사요?",
    });
    await drainDispatch(h);

    const links = await h.ctx.repos.trackedLink.listByConversation(s.workspaceId, convId);
    expect(links).toHaveLength(1);
    expect(links[0]!.clickedAt).toBeNull();

    const res = await http(h, "POST", "/t/click", {
      body: { token: links[0]!.token },
      headers: { "x-forwarded-for": ip },
    });
    expect(res.status).toBe(204);

    const after = await h.ctx.repos.trackedLink.findByToken(links[0]!.token);
    expect(after?.clickedAt).toBeTruthy();
  });
});

// ---------- 09 §5-2 클릭 멱등/무효 토큰 처리 ----------
describe("09 §5-2 /t/click 멱등·무효 토큰", () => {
  it("최초 클릭 → clickedAt 기록, 2회째는 값 불변, 무효 토큰도 204", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const [link] = await h.ctx.repos.trackedLink.createMany(s.workspaceId, [
      { conversationId: convId, visitorId: s.visitorId, targetUrl: "https://shop.example.com/x" },
    ]);

    const res1 = await http(h, "POST", "/t/click", {
      body: { token: link!.token },
      headers: { "x-forwarded-for": ip },
    });
    expect(res1.status).toBe(204);
    const afterFirst = await h.ctx.repos.trackedLink.findByToken(link!.token);
    expect(afterFirst?.clickedAt).toBeTruthy();
    const firstClickedAt = afterFirst!.clickedAt!.getTime();

    await sleep(10);
    const res2 = await http(h, "POST", "/t/click", {
      body: { token: link!.token },
      headers: { "x-forwarded-for": ip },
    });
    expect(res2.status).toBe(204);
    const afterSecond = await h.ctx.repos.trackedLink.findByToken(link!.token);
    expect(afterSecond?.clickedAt!.getTime()).toBe(firstClickedAt);

    // 무효 토큰 — 조용히 무시, 여전히 204.
    const resInvalid = await http(h, "POST", "/t/click", {
      body: { token: "no_such_token_xyz" },
      headers: { "x-forwarded-for": ip },
    });
    expect(resInvalid.status).toBe(204);

    // 본문이 애초에 스키마 검증 실패(token 누락)여도 204.
    const resBad = await http(h, "POST", "/t/click", {
      body: { nope: true },
      headers: { "x-forwarded-for": ip },
    });
    expect(resBad.status).toBe(204);
  });
});

// ---------- 09 §5-3 /t/conversion externalRef 멱등 ----------
describe("09 §5-3 /t/conversion externalRef 멱등", () => {
  it("동일 externalRef 재수신 → conversions 1건 유지, 응답은 매번 204", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const [link] = await h.ctx.repos.trackedLink.createMany(s.workspaceId, [
      { conversationId: convId, visitorId: s.visitorId, targetUrl: "https://shop.example.com/y" },
    ]);
    await http(h, "POST", "/t/click", {
      body: { token: link!.token },
      headers: { "x-forwarded-for": ip },
    });

    const payload = {
      workspaceId: s.workspaceId,
      externalRef: "order-dup-001",
      amount: 39000,
      visitorToken: s.token,
      occurredAt: new Date().toISOString(),
    };
    const res1 = await http(h, "POST", "/t/conversion", { body: payload, headers: { "x-forwarded-for": ip } });
    expect(res1.status).toBe(204);
    const res2 = await http(h, "POST", "/t/conversion", { body: payload, headers: { "x-forwarded-for": ip } });
    expect(res2.status).toBe(204);

    const rows = await h.ctx.repos.conversion.listByConversation(s.workspaceId, convId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(39000);
  });
});

// ---------- 09 §5-4 귀속 규칙(last_click / first_click) ----------
describe("09 §5-4 귀속: last_click vs first_click", () => {
  it("동일 visitor가 대화 A, B의 링크를 순서대로 클릭 → 규칙에 따라 다른 대화로 집계", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);
    const owner = await newUserWithWorkspace(h, s.workspaceId);

    const convA = await newConversation(h, s.token);
    const convB = await newConversation(h, s.token);
    const [linkA] = await h.ctx.repos.trackedLink.createMany(s.workspaceId, [
      { conversationId: convA, visitorId: s.visitorId, targetUrl: "https://shop.example.com/a" },
    ]);
    const [linkB] = await h.ctx.repos.trackedLink.createMany(s.workspaceId, [
      { conversationId: convB, visitorId: s.visitorId, targetUrl: "https://shop.example.com/b" },
    ]);

    // A 먼저, B 나중에 클릭.
    await http(h, "POST", "/t/click", { body: { token: linkA!.token }, headers: { "x-forwarded-for": ip } });
    await sleep(20);
    await http(h, "POST", "/t/click", { body: { token: linkB!.token }, headers: { "x-forwarded-for": ip } });

    // 기본 attributionRule=last_click → 가장 최근(B) 클릭에 귀속.
    await http(h, "POST", "/t/conversion", {
      headers: { "x-forwarded-for": ip },
      body: {
        workspaceId: s.workspaceId,
        externalRef: "order-last-click",
        amount: 10000,
        visitorToken: s.token,
      },
    });
    expect(await h.ctx.repos.conversion.listByConversation(s.workspaceId, convB)).toHaveLength(1);
    expect(await h.ctx.repos.conversion.listByConversation(s.workspaceId, convA)).toHaveLength(0);

    // attributionRule=first_click으로 변경 → 가장 이른(A) 클릭에 귀속.
    const patch = await http(h, "PATCH", `/v1/workspaces/${s.workspaceId}/settings`, {
      cookie: owner.cookie,
      body: { attributionRule: "first_click" },
    });
    expect(patch.status).toBe(200);

    await http(h, "POST", "/t/conversion", {
      headers: { "x-forwarded-for": ip },
      body: {
        workspaceId: s.workspaceId,
        externalRef: "order-first-click",
        amount: 5000,
        visitorToken: s.token,
      },
    });
    expect(await h.ctx.repos.conversion.listByConversation(s.workspaceId, convA)).toHaveLength(1);
    // B는 last_click 건 1개만 유지(추가 안 됨).
    expect(await h.ctx.repos.conversion.listByConversation(s.workspaceId, convB)).toHaveLength(1);
  });

  it("귀속 후보(클릭 이력) 없으면 조용히 스킵 — conversions 미생성, 응답은 204", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);

    const res = await http(h, "POST", "/t/conversion", {
      headers: { "x-forwarded-for": ip },
      body: {
        workspaceId: s.workspaceId,
        externalRef: "order-no-click",
        amount: 1000,
        visitorToken: s.token,
      },
    });
    expect(res.status).toBe(204);
    expect(await h.ctx.repos.conversion.listAttributed(s.workspaceId)).toHaveLength(0);
  });
});

// ---------- 09 §5-5 S2 워크스페이스 → 트래킹 API 404 ----------
describe("09 §5-5 S2 세그먼트 → 트래킹 API 404", () => {
  it("GET tracking/summary, GET conversations/:id/tracking 모두 404", async () => {
    const s2Ws = await h.ctx.repos.workspace.create({ name: "S2 워크스페이스", segment: "s2_no_site" });
    const owner = await newUserWithWorkspace(h, s2Ws.id);

    const sessionRes = await http(h, "POST", "/v1/widget/session", {
      body: { workspaceId: s2Ws.id },
    });
    const convId = await newConversation(h, sessionRes.json.visitorToken);

    const summaryRes = await http(
      h,
      "GET",
      `/v1/workspaces/${s2Ws.id}/tracking/summary?from=2020-01-01T00:00:00.000Z&to=2030-01-01T00:00:00.000Z`,
      { cookie: owner.cookie },
    );
    expect(summaryRes.status).toBe(404);
    expect(summaryRes.json.error.code).toBe("not_found");

    const detailRes = await http(
      h,
      "GET",
      `/v1/workspaces/${s2Ws.id}/conversations/${convId}/tracking`,
      { cookie: owner.cookie },
    );
    expect(detailRes.status).toBe(404);
    expect(detailRes.json.error.code).toBe("not_found");
  });
});

// ---------- 레이트리밋 초과에도 204(04 §0.2) ----------
describe("09 §5 /t/* 레이트리밋 초과에도 204", () => {
  it("60/min 한도를 넘겨도 모든 응답이 204이며 손님에게 에러가 노출되지 않는다", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const [link] = await h.ctx.repos.trackedLink.createMany(s.workspaceId, [
      { conversationId: convId, visitorId: s.visitorId, targetUrl: "https://shop.example.com/z" },
    ]);

    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) {
      const res = await http(h, "POST", "/t/click", {
        body: { token: link!.token },
        headers: { "x-forwarded-for": ip },
      });
      statuses.push(res.status);
    }
    expect(statuses.every((st) => st === 204)).toBe(true);

    // 한도 내 최초 클릭만 반영되고, 이후 초과분은 조용히 무시되어도 값은 여전히 정상(클릭 기록됨).
    const after = await h.ctx.repos.trackedLink.findByToken(link!.token);
    expect(after?.clickedAt).toBeTruthy();
  });
});

// ---------- 대시보드 조회 API(부가 — 정상 케이스 확인) ----------
describe("09 §5 대시보드 트래킹 조회 API(S1)", () => {
  it("대화 상세 tracking과 워크스페이스 summary가 기대한 값을 반환한다", async () => {
    const ip = freshIp();
    const s = await newVisitorSession(h);
    const owner = await newUserWithWorkspace(h, s.workspaceId);
    const convId = await newConversation(h, s.token);
    const [link] = await h.ctx.repos.trackedLink.createMany(s.workspaceId, [
      { conversationId: convId, visitorId: s.visitorId, targetUrl: "https://shop.example.com/summary" },
    ]);
    await http(h, "POST", "/t/click", {
      body: { token: link!.token },
      headers: { "x-forwarded-for": ip },
    });
    await http(h, "POST", "/t/conversion", {
      headers: { "x-forwarded-for": ip },
      body: {
        workspaceId: s.workspaceId,
        externalRef: "order-summary-1",
        amount: 25000,
        visitorToken: s.token,
      },
    });

    const detail = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/tracking`,
      { cookie: owner.cookie },
    );
    expect(detail.status).toBe(200);
    expect(detail.json.trackedLinks).toHaveLength(1);
    expect(detail.json.trackedLinks[0].clickedAt).toBeTruthy();
    expect(detail.json.conversions).toHaveLength(1);
    expect(detail.json.conversions[0].amount).toBe(25000);
    expect(detail.json.conversions[0].source).toBe("click_only");

    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const summary = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/tracking/summary?from=${from}&to=${to}`,
      { cookie: owner.cookie },
    );
    expect(summary.status).toBe(200);
    expect(summary.json.linkedConversations).toBeGreaterThanOrEqual(1);
    expect(summary.json.clickedConversations).toBeGreaterThanOrEqual(1);
    expect(summary.json.attributedRevenueKrw).toBeGreaterThanOrEqual(25000);
    expect(summary.json.bySource.click_only).toBeGreaterThanOrEqual(1);
  });

  it("visitor_token으로는 트래킹 대시보드 API에 접근할 수 없다(경로상 /v1/widget 밖 — 403/401)", async () => {
    const s = await newVisitorSession(h);
    const convId = await newConversation(h, s.token);
    const res = await http(
      h,
      "GET",
      `/v1/workspaces/${s.workspaceId}/conversations/${convId}/tracking`,
      { token: s.token },
    );
    // 세션 쿠키 없음 → requireUser에서 auth/invalid(401)로 차단.
    expect(res.status).toBe(401);
  });
});
