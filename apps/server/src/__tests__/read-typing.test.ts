/**
 * 양방향 읽음 표시(read receipts) + 손님 타이핑 통합 — 04 §5.
 * 커버: visitor read.mark → 저장 + read.update(by=visitor) 상담원 수신 /
 *       agent read.mark → 저장 + read.update(by=agent) 손님 수신 /
 *       visitor typing → 상담원 소켓에만 도달(위젯 미수신).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createHarness,
  http,
  newConversation,
  newUserWithWorkspace,
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

/** 같은 워크스페이스에 상담원(멤버) + 방문자 세션 + 대화 + 첫 메시지를 구성. */
async function setupConversation() {
  const member = await newUserWithWorkspace(h);
  const sess = await http(h, "POST", "/v1/widget/session", {
    body: { workspaceId: member.workspaceId },
  });
  const token = sess.json.visitorToken as string;
  const convId = await newConversation(h, token);

  const visitorWs = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${token}`);
  visitorWs.send("message.send", { conversationId: convId, clientMsgId: "m1", text: "안녕하세요" });
  const ack = await visitorWs.nextType("message.ack");
  const messageId = ack.payload.message.id as string;

  const agentWs = await WsClient.connect(`${h.wsBase}/ws/agent`, { cookie: member.cookie });
  agentWs.send("subscribe.conversation", { conversationId: convId });
  await sleep(250); // 구독 완료 대기

  return { member, token, convId, messageId, visitorWs, agentWs };
}

describe("read receipts — visitor → agent", () => {
  it("visitor read.mark → 저장 + read.update(by=visitor) 상담원 수신", async () => {
    const { member, convId, messageId, visitorWs, agentWs } = await setupConversation();

    visitorWs.send("read.mark", { conversationId: convId, lastMessageId: messageId });

    const upd = await agentWs.nextType("read.update");
    expect(upd.payload.by).toBe("visitor");
    expect(upd.payload.conversationId).toBe(convId);
    expect(upd.payload.lastMessageId).toBe(messageId);

    // DB 저장 확인.
    const conv = await h.ctx.repos.conversation.getById(member.workspaceId, convId);
    expect(conv?.visitorLastReadMessageId).toBe(messageId);

    visitorWs.close();
    agentWs.close();
  });
});

describe("read receipts — agent → visitor", () => {
  it("agent read.mark → 저장 + read.update(by=agent) 손님 수신", async () => {
    const { member, convId, messageId, visitorWs, agentWs } = await setupConversation();

    agentWs.send("read.mark", { conversationId: convId, lastMessageId: messageId });

    const upd = await visitorWs.nextType("read.update");
    expect(upd.payload.by).toBe("agent");
    expect(upd.payload.lastMessageId).toBe(messageId);

    const conv = await h.ctx.repos.conversation.getById(member.workspaceId, convId);
    expect(conv?.agentLastReadMessageId).toBe(messageId);

    visitorWs.close();
    agentWs.close();
  });
});

describe("인박스 실시간 갱신 — unread 반영(09 §2 메시징 신뢰성)", () => {
  it("visitor 메시지 수신 시 inbox.upsert payload에 unread 필드가 실린다", async () => {
    const member = await newUserWithWorkspace(h);
    const sess = await http(h, "POST", "/v1/widget/session", {
      body: { workspaceId: member.workspaceId },
    });
    const token = sess.json.visitorToken as string;
    const convId = await newConversation(h, token);

    const agentWs = await WsClient.connect(`${h.wsBase}/ws/agent`, { cookie: member.cookie });
    agentWs.send("subscribe.workspace", { workspaceId: member.workspaceId });
    await sleep(250); // 구독 완료 대기

    const visitorWs = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${token}`);
    visitorWs.send("message.send", { conversationId: convId, clientMsgId: "u1", text: "첫 문의" });
    await visitorWs.nextType("message.ack");

    const first = await agentWs.nextType("inbox.upsert");
    expect(first.payload.conversationSummary.conversation.id).toBe(convId);
    expect(typeof first.payload.conversationSummary.unread).toBe("number");

    visitorWs.close();
    agentWs.close();
  });

  // unread 상관 서브쿼리는 SELECT 목록 컨텍스트의 drizzle 컬럼 비정규화 렌더링에 취약했다 —
  // repos/conversation.ts unreadCountExpr 주석 참조. 수신마다 값이 누적되는지까지 여기서 고정한다.
  it(
    "visitor 메시지 수신 시 inbox.upsert의 unread가 1, 추가 수신 시 2로 증가",
    async () => {
      const member = await newUserWithWorkspace(h);
      const sess = await http(h, "POST", "/v1/widget/session", {
        body: { workspaceId: member.workspaceId },
      });
      const token = sess.json.visitorToken as string;
      const convId = await newConversation(h, token);

      const agentWs = await WsClient.connect(`${h.wsBase}/ws/agent`, { cookie: member.cookie });
      agentWs.send("subscribe.workspace", { workspaceId: member.workspaceId });
      await sleep(250); // 구독 완료 대기

      const visitorWs = await WsClient.connect(`${h.wsBase}/ws/visitor?token=${token}`);
      visitorWs.send("message.send", { conversationId: convId, clientMsgId: "u1", text: "첫 문의" });
      await visitorWs.nextType("message.ack");

      const first = await agentWs.nextType("inbox.upsert");
      expect(first.payload.conversationSummary.unread).toBe(1);

      visitorWs.send("message.send", { conversationId: convId, clientMsgId: "u2", text: "추가 문의" });
      await visitorWs.nextType("message.ack");

      const second = await agentWs.nextType("inbox.upsert");
      expect(second.payload.conversationSummary.unread).toBe(2);

      visitorWs.close();
      agentWs.close();
    },
  );
});

describe("agent read.mark 후 목록 재조회 — unread=0", () => {
  it("read.mark 저장 후 GET 목록의 unread가 0이 된다(+ DB 읽음 마커 갱신 확인)", async () => {
    const { member, convId, messageId, visitorWs, agentWs } = await setupConversation();

    agentWs.send("read.mark", { conversationId: convId, lastMessageId: messageId });
    await agentWs.nextType("read.update"); // 저장 완료 동기화 지점(convAll에 자기 자신도 구독 중)

    // 근거 데이터 — 읽음 마커가 실제로 저장됐는지(listForInbox의 unread 컬럼과 무관한 직접 확인).
    const conv = await h.ctx.repos.conversation.getById(member.workspaceId, convId);
    expect(conv?.agentLastReadMessageId).toBe(messageId);

    const list = await http(h, "GET", `/v1/workspaces/${member.workspaceId}/conversations`, {
      cookie: member.cookie,
    });
    const item = list.json.items.find(
      (i: { conversation: { id: string } }) => i.conversation.id === convId,
    );
    expect(item).toBeTruthy();
    expect(item.unread).toBe(0);

    visitorWs.close();
    agentWs.close();
  });
});

describe("손님 타이핑 → 상담원 전용", () => {
  it("visitor typing.set → agent만 typing.start(by=visitor) 수신, visitor 미수신", async () => {
    const { convId, visitorWs, agentWs } = await setupConversation();

    visitorWs.send("typing.set", { conversationId: convId, isTyping: true });

    const typing = await agentWs.nextType("typing.start");
    expect(typing.payload.by).toBe("visitor");
    expect(typing.payload.conversationId).toBe(convId);

    // 손님 소켓에는 자기 타이핑이 되돌아오지 않는다.
    await visitorWs.expectNone((m) => m.type === "typing.start" || m.type === "typing.stop", 400);

    visitorWs.close();
    agentWs.close();
  });
});
