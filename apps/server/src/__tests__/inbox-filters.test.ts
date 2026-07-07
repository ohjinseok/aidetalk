/**
 * 인박스 목록 필터(assigneeId/tagId/unread/favorite) + counts 배지 통합 테스트.
 * 라우트: routes/workspaces/inbox.ts GET /:wsId/conversations, GET /:wsId/conversations/counts.
 * repo: packages/db/src/repos/conversation.ts listForInbox/countsForInbox.
 *
 * ⚠️ 방문자/대화 생성은 위젯 세션 발급 HTTP 엔드포인트(POST /v1/widget/session, 30/min/IP 한도)를
 *   거치지 않고 repo(visitor.getOrCreateByToken/conversation.create)를 직접 호출한다 — 시나리오 하나에
 *   방문자 5명이 필요해 반복 호출 시 세션 발급 레이트리밋에 걸릴 수 있기 때문(09 §0.2와 무관한 관심사).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHarness, http, newUserWithWorkspace, type Harness } from "../../test/harness";

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function addMember(
  workspaceId: string,
  role: "owner" | "agent_member" = "agent_member",
): Promise<{ userId: string; cookie: string }> {
  const email = `m_${Math.random().toString(36).slice(2)}@example.com`;
  const user = await h.ctx.repos.user.create({ email, password: "password123", name: "멤버" });
  await h.ctx.repos.member.addActive(workspaceId, user.id, role);
  const sessionId = await h.ctx.sessionStore.create(user.id);
  return { userId: user.id, cookie: `od_session=${sessionId}` };
}

/** 방문자 + 대화를 repo로 직접 생성(HTTP 위젯 세션 레이트리밋 우회) — conversationId 반환. */
async function newVisitorConversation(workspaceId: string): Promise<{ visitorId: string; conversationId: string }> {
  const visitor = await h.ctx.repos.visitor.getOrCreateByToken(workspaceId, {});
  const conv = await h.ctx.repos.conversation.create(workspaceId, { visitorId: visitor.id, mode: "human" });
  return { visitorId: visitor.id, conversationId: conv.id };
}

/** 방문자 메시지를 repo로 직접 추가(WS 없이) — role=visitor, 미열람 유발용. */
async function addVisitorMessage(
  workspaceId: string,
  conversationId: string,
  visitorId: string,
  text: string,
) {
  return h.ctx.repos.message.append(workspaceId, conversationId, {
    role: "visitor",
    authorId: visitorId,
    content: { type: "text", text },
  });
}

/**
 * 필터/카운트 공용 시나리오 — 워크스페이스 1개, 소유자 O + 멤버 M1, 태그 T1/T2.
 * 읽기 전용으로만 검증하는 여러 it() 블록이 공유하므로 describe 전체에서 딱 한 번만 구성한다.
 *   conv1: O 배정 + T1 + O 즐겨찾기 + 미열람(visitor 메시지, 안읽음)
 *   conv2: 미배정 + 무태그 + 읽음(visitor 메시지 후 agent read.mark)
 *   conv3: M1 배정 + T2 + 즐겨찾기 없음 + 메시지 없음(읽음 상태)
 *   conv4: O 배정 + T1 + closed(모수 제외 확인용)
 *   conv5: 미배정 + M1 즐겨찾기 + 미열람
 */
async function buildScenario() {
  const owner = await newUserWithWorkspace(h);
  const wsId = owner.workspaceId;
  const m1 = await addMember(wsId);

  const t1 = await http(h, "POST", `/v1/workspaces/${wsId}/tags`, {
    cookie: owner.cookie,
    body: { name: "환불" },
  });
  const t2 = await http(h, "POST", `/v1/workspaces/${wsId}/tags`, {
    cookie: owner.cookie,
    body: { name: "배송" },
  });
  const tag1 = t1.json.tag.id as string;
  const tag2 = t2.json.tag.id as string;

  const c1 = await newVisitorConversation(wsId);
  await h.ctx.repos.conversation.assign(wsId, c1.conversationId, owner.userId);
  await http(h, "POST", `/v1/workspaces/${wsId}/conversations/${c1.conversationId}/tags`, {
    cookie: owner.cookie,
    body: { tagId: tag1 },
  });
  await http(h, "PUT", `/v1/workspaces/${wsId}/conversations/${c1.conversationId}/favorite`, {
    cookie: owner.cookie,
  });
  await addVisitorMessage(wsId, c1.conversationId, c1.visitorId, "환불하고 싶어요");

  const c2 = await newVisitorConversation(wsId);
  const msg2 = await addVisitorMessage(wsId, c2.conversationId, c2.visitorId, "배송 언제 오나요");
  await h.ctx.repos.conversation.setReadMarker(wsId, c2.conversationId, "agent", msg2.id);

  const c3 = await newVisitorConversation(wsId);
  await h.ctx.repos.conversation.assign(wsId, c3.conversationId, m1.userId);
  await http(h, "POST", `/v1/workspaces/${wsId}/conversations/${c3.conversationId}/tags`, {
    cookie: owner.cookie,
    body: { tagId: tag2 },
  });

  const c4 = await newVisitorConversation(wsId);
  await h.ctx.repos.conversation.assign(wsId, c4.conversationId, owner.userId);
  await http(h, "POST", `/v1/workspaces/${wsId}/conversations/${c4.conversationId}/tags`, {
    cookie: owner.cookie,
    body: { tagId: tag1 },
  });
  await http(h, "POST", `/v1/workspaces/${wsId}/conversations/${c4.conversationId}/close`, {
    cookie: owner.cookie,
  });

  const c5 = await newVisitorConversation(wsId);
  await http(h, "PUT", `/v1/workspaces/${wsId}/conversations/${c5.conversationId}/favorite`, {
    cookie: m1.cookie,
  });
  await addVisitorMessage(wsId, c5.conversationId, c5.visitorId, "재고 있나요");

  return {
    owner,
    m1,
    wsId,
    tag1,
    tag2,
    conv1: c1.conversationId,
    conv2: c2.conversationId,
    conv3: c3.conversationId,
    conv4: c4.conversationId,
    conv5: c5.conversationId,
  };
}

type Scenario = Awaited<ReturnType<typeof buildScenario>>;
let s: Scenario;

beforeAll(async () => {
  s = await buildScenario();
});

describe("인박스 목록 필터", () => {
  it("assigneeId=<userId> — 그 상담원 담당만", async () => {
    const res = await http(
      h,
      "GET",
      `/v1/workspaces/${s.wsId}/conversations?assigneeId=${s.owner.userId}`,
      { cookie: s.owner.cookie },
    );
    const ids = res.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(ids).toEqual(expect.arrayContaining([s.conv1, s.conv4]));
    expect(ids).not.toContain(s.conv2);
    expect(ids).not.toContain(s.conv3);
    expect(ids).not.toContain(s.conv5);
  });

  it("assigneeId=none — 미배정만", async () => {
    const res = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations?assigneeId=none`, {
      cookie: s.owner.cookie,
    });
    const ids = res.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(ids).toEqual(expect.arrayContaining([s.conv2, s.conv5]));
    expect(ids).not.toContain(s.conv1);
    expect(ids).not.toContain(s.conv3);
    expect(ids).not.toContain(s.conv4);
  });

  it("tagId — 그 태그 부착 대화만", async () => {
    const res1 = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations?tagId=${s.tag1}`, {
      cookie: s.owner.cookie,
    });
    const ids1 = res1.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(ids1).toEqual(expect.arrayContaining([s.conv1, s.conv4]));
    expect(ids1).not.toContain(s.conv3);

    const res2 = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations?tagId=${s.tag2}`, {
      cookie: s.owner.cookie,
    });
    const ids2 = res2.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(ids2).toEqual([s.conv3]);
  });

  it("unread=1 — 미열람(visitor 미확인) 있는 대화만", async () => {
    const res = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations?unread=1`, {
      cookie: s.owner.cookie,
    });
    const ids = res.json.items.map((i: { conversation: { id: string } }) => i.conversation.id);
    expect(ids).toEqual(expect.arrayContaining([s.conv1, s.conv5]));
    expect(ids).not.toContain(s.conv2);
    expect(ids).not.toContain(s.conv3);
  });

  it("favorite=1 — 요청 상담원 본인의 즐겨찾기만(멤버별 독립)", async () => {
    const ownerRes = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations?favorite=1`, {
      cookie: s.owner.cookie,
    });
    expect(
      ownerRes.json.items.map((i: { conversation: { id: string } }) => i.conversation.id),
    ).toEqual([s.conv1]);

    const m1Res = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations?favorite=1`, {
      cookie: s.m1.cookie,
    });
    expect(
      m1Res.json.items.map((i: { conversation: { id: string } }) => i.conversation.id),
    ).toEqual([s.conv5]);
  });

  it("필터 + status + 커서 페이지네이션 조합 — status=open&assigneeId=none, limit=1 두 페이지", async () => {
    const page1 = await http(
      h,
      "GET",
      `/v1/workspaces/${s.wsId}/conversations?status=open&assigneeId=none&limit=1`,
      { cookie: s.owner.cookie },
    );
    expect(page1.json.items).toHaveLength(1);
    expect(page1.json.nextCursor).toBeTruthy();

    const page2 = await http(
      h,
      "GET",
      `/v1/workspaces/${s.wsId}/conversations?status=open&assigneeId=none&limit=1&cursor=${encodeURIComponent(
        page1.json.nextCursor,
      )}`,
      { cookie: s.owner.cookie },
    );
    expect(page2.json.items).toHaveLength(1);

    const allIds = [
      ...page1.json.items.map((i: { conversation: { id: string } }) => i.conversation.id),
      ...page2.json.items.map((i: { conversation: { id: string } }) => i.conversation.id),
    ];
    expect(allIds.sort()).toEqual([s.conv2, s.conv5].sort());
    // status=open이므로 closed인 conv4는 절대 포함되지 않는다.
    expect(allIds).not.toContain(s.conv4);
  });

  it("목록 items에 unread/tagIds/favorite 필드가 실린다", async () => {
    const res = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations`, {
      cookie: s.owner.cookie,
    });
    const item1 = res.json.items.find(
      (i: { conversation: { id: string } }) => i.conversation.id === s.conv1,
    );
    expect(typeof item1.unread).toBe("number");
    expect(item1.tagIds).toContain(s.tag1);
    expect(item1.favorite).toBe(true);

    const item3 = res.json.items.find(
      (i: { conversation: { id: string } }) => i.conversation.id === s.conv3,
    );
    expect(item3.unread).toBe(0);
    expect(item3.tagIds).toContain(s.tag2);
    expect(item3.favorite).toBe(false);
  });

  // listForInbox 인라인 unread 컬럼 — repos/conversation.ts unreadCountExpr 주석 참조(렌더링 회귀 방지).
  it("conv1(미열람 1건)의 목록 unread가 1이다", async () => {
    const res = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations`, {
      cookie: s.owner.cookie,
    });
    const item1 = res.json.items.find(
      (i: { conversation: { id: string } }) => i.conversation.id === s.conv1,
    );
    expect(item1.unread).toBe(1);
  });
});

describe("인박스 counts 배지", () => {
  it("mine/all/unread/favorites/unassigned/byAssignee/byTag 교차 검증, closed는 모수 제외", async () => {
    const ownerCounts = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations/counts`, {
      cookie: s.owner.cookie,
    });
    expect(ownerCounts.json.all).toBe(4); // conv1,2,3,5 (conv4는 closed로 제외)
    expect(ownerCounts.json.mine).toBe(1); // conv1
    expect(ownerCounts.json.unassigned).toBe(2); // conv2, conv5
    expect(ownerCounts.json.unread).toBe(2); // conv1, conv5
    expect(ownerCounts.json.favorites).toBe(1); // conv1(owner 본인 즐겨찾기)

    const byAssignee = new Map(
      ownerCounts.json.byAssignee.map((r: { assigneeId: string; count: number }) => [
        r.assigneeId,
        r.count,
      ]),
    );
    expect(byAssignee.get(s.owner.userId)).toBe(1);
    expect(byAssignee.get(s.m1.userId)).toBe(1);

    const byTag = new Map(
      ownerCounts.json.byTag.map((r: { tagId: string; count: number }) => [r.tagId, r.count]),
    );
    expect(byTag.get(s.tag1)).toBe(1); // conv1만(conv4는 closed로 제외)
    expect(byTag.get(s.tag2)).toBe(1); // conv3

    // m1 관점 — mine/favorites만 달라지고 나머지(all/unassigned/unread/byAssignee/byTag)는 동일.
    const m1Counts = await http(h, "GET", `/v1/workspaces/${s.wsId}/conversations/counts`, {
      cookie: s.m1.cookie,
    });
    expect(m1Counts.json.all).toBe(4);
    expect(m1Counts.json.mine).toBe(1); // conv3
    expect(m1Counts.json.unassigned).toBe(2);
    expect(m1Counts.json.unread).toBe(2);
    expect(m1Counts.json.favorites).toBe(1); // conv5(m1 본인 즐겨찾기)
  });
});
